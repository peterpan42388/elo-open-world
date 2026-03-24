#!/usr/bin/env python3
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
import platform
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import webbrowser
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Dict, List, Optional

import requests
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QAction, QActionGroup, QIcon
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QMenuBar,
    QProgressBar,
    QPushButton,
    QStackedWidget,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def append_bridge_log(log_path: str, message: str):
    if not log_path:
        return
    try:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as fh:
            fh.write(f"[{utc_now_iso()}] {message}\n")
    except Exception:
        pass


def write_bridge_health(health_path: str, payload: Dict):
    if not health_path:
        return
    try:
        os.makedirs(os.path.dirname(health_path), exist_ok=True)
        temp = f"{health_path}.tmp"
        with open(temp, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(temp, health_path)
    except Exception:
        pass


def provider_default_base_url(provider: str) -> str:
    mapping = {
        "openai": "https://api.openai.com/v1",
        "deepseek": "https://api.deepseek.com/v1",
        "moonshot": "https://api.moonshot.cn/v1",
        "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "meta": "https://api.llama.com/compat/v1",
        "mistral": "https://api.mistral.ai/v1",
        "xai": "https://api.x.ai/v1",
        "openrouter": "https://openrouter.ai/api/v1",
    }
    return mapping.get((provider or "").strip().lower(), "https://api.openai.com/v1")


def model_chat_completion(config: Dict, user_text: str, log_path: str) -> str:
    api_key = str(config.get("modelApiKey") or "").strip()
    if not api_key:
        raise RuntimeError("模型 API Key 为空")
    model_name = str(config.get("modelName") or "").strip()
    if not model_name:
        raise RuntimeError("模型名称为空")
    provider = str(config.get("modelProvider") or "").strip().lower()
    base_url = str(config.get("modelBaseUrl") or "").strip() or provider_default_base_url(provider)
    base_url = base_url.rstrip("/")
    if base_url.endswith("/chat/completions"):
        endpoint = base_url
    else:
        endpoint = f"{base_url}/chat/completions"
    agent_name = str(config.get("agentName") or "ELO Agent").strip()
    personality = str(config.get("agentPersonality") or "").strip()
    system_prompt = (
        f"You are {agent_name}, an OpenClaw agent in ELO Open World."
        " Keep replies concise, practical, and friendly."
    )
    if personality:
        system_prompt = f"{system_prompt} Personality: {personality}"
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
        "temperature": 0.6,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    resp = requests.post(endpoint, json=payload, headers=headers, timeout=120)
    if resp.status_code >= 400:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text[:400]
        append_bridge_log(log_path, f"model error: status={resp.status_code} detail={detail}")
        raise RuntimeError(f"模型调用失败 ({resp.status_code})")
    data = resp.json()
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("模型返回为空")
    message = choices[0].get("message", {})
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        chunks = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    chunks.append(text)
        if chunks:
            return "\n".join(chunks).strip()
    raise RuntimeError("模型未返回可读内容")


def send_telegram_message(bot_token: str, chat_id: str, text: str):
    endpoint = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    resp = requests.post(endpoint, json={"chat_id": chat_id, "text": text}, timeout=30)
    data = resp.json() if resp.content else {}
    if resp.status_code >= 400 or not data.get("ok"):
        raise RuntimeError(f"Telegram sendMessage failed: status={resp.status_code}")


def read_init_guide(config: Dict) -> str:
    init_path = str(config.get("initGuidePath") or "").strip()
    if not init_path or not os.path.exists(init_path):
        return ""
    try:
        with open(init_path, "r", encoding="utf-8") as fh:
            content = fh.read().strip()
            if len(content) > 1200:
                return content[:1200] + "\n...\n"
            return content
    except Exception:
        return ""


def run_telegram_bridge_worker(config_path: str, log_path: str = "", health_path: str = "") -> int:
    try:
        with open(config_path, "r", encoding="utf-8") as fh:
            config = json.load(fh)
    except Exception as exc:
        append_bridge_log(log_path, f"failed to read config: {exc}")
        return 2

    bot_token = str(config.get("botToken") or "").strip()
    chat_id = str(config.get("chatId") or "").strip()
    if not bot_token:
        append_bridge_log(log_path, "missing bot token")
        return 2
    if not health_path:
        health_path = str(config.get("healthPath") or "").strip()
    if not log_path:
        log_path = str(config.get("logPath") or "").strip()

    append_bridge_log(log_path, "telegram bridge starting")
    health = {
        "contract": "elo-agent-onboarder.telegram-bridge-health.v1",
        "running": True,
        "lastHeartbeatAt": utc_now_iso(),
        "lastMessageAt": "",
        "lastError": "",
        "chatId": chat_id,
    }
    write_bridge_health(health_path, health)

    offset = None
    init_guide = read_init_guide(config)
    backoff = 2
    try:
        while True:
            health["lastHeartbeatAt"] = utc_now_iso()
            write_bridge_health(health_path, health)
            params = {"timeout": 45}
            if offset is not None:
                params["offset"] = offset
            try:
                resp = requests.get(
                    f"https://api.telegram.org/bot{bot_token}/getUpdates",
                    params=params,
                    timeout=60,
                )
                data = resp.json() if resp.content else {}
                if resp.status_code >= 400 or not data.get("ok"):
                    raise RuntimeError(f"getUpdates failed: status={resp.status_code}")
                updates = data.get("result") or []
                if not updates:
                    continue
                for update in updates:
                    if not isinstance(update, dict):
                        continue
                    update_id = update.get("update_id")
                    if isinstance(update_id, int):
                        offset = update_id + 1
                    message = update.get("message") or update.get("edited_message") or {}
                    if not isinstance(message, dict):
                        continue
                    from_user = message.get("from") or {}
                    if from_user.get("is_bot"):
                        continue
                    text = str(message.get("text") or "").strip()
                    if not text:
                        continue
                    chat = message.get("chat") or {}
                    current_chat_id = str(chat.get("id") or "").strip()
                    if chat_id and current_chat_id and current_chat_id != chat_id:
                        continue
                    if not chat_id and current_chat_id:
                        chat_id = current_chat_id
                        health["chatId"] = chat_id
                    if not chat_id:
                        continue

                    lower = text.lower()
                    if lower in {"/start", "start"}:
                        reply = (
                            f"Hi, I am {config.get('agentName') or 'your OpenClaw agent'}.\n"
                            "I am online now. Send me a message and I will reply."
                        )
                    elif "开始学习技能" in text or "learn skills" in lower:
                        reply = init_guide or "已收到。请先阅读 INIT.md、SAFE.md、SPIRIT.md，然后回复你的第一个学习目标。"
                    else:
                        reply = model_chat_completion(config, text, log_path)
                    send_telegram_message(bot_token, chat_id, reply)
                    health["lastMessageAt"] = utc_now_iso()
                    health["lastError"] = ""
                    write_bridge_health(health_path, health)
                    append_bridge_log(log_path, f"replied message update_id={update_id}")
                backoff = 2
            except Exception as exc:
                health["lastError"] = str(exc)
                write_bridge_health(health_path, health)
                append_bridge_log(log_path, f"loop error: {exc}")
                time.sleep(min(backoff, 30))
                backoff = min(backoff * 2, 30)
    except KeyboardInterrupt:
        append_bridge_log(log_path, "telegram bridge interrupted")
    finally:
        health["running"] = False
        health["lastHeartbeatAt"] = utc_now_iso()
        write_bridge_health(health_path, health)
        append_bridge_log(log_path, "telegram bridge stopped")
    return 0


MODEL_FALLBACK_CATALOG = {
    "contract": "elo-agent-onboarder.model-catalog.v1",
    "providers": [
        {
            "providerId": "openai",
            "displayName": "OpenAI",
            "website": "https://platform.openai.com",
            "models": [
                {"modelId": "gpt-4.1", "displayName": "GPT-4.1", "traits": ["coding", "reasoning", "tool-use"]},
                {"modelId": "gpt-4o", "displayName": "GPT-4o", "traits": ["multimodal", "realtime", "balanced"]},
                {"modelId": "gpt-4o-mini", "displayName": "GPT-4o mini", "traits": ["low-cost", "fast", "general"]},
            ],
        },
        {
            "providerId": "anthropic",
            "displayName": "Anthropic",
            "website": "https://console.anthropic.com",
            "models": [
                {
                    "modelId": "claude-3-7-sonnet-latest",
                    "displayName": "Claude 3.7 Sonnet",
                    "traits": ["long-context", "analysis", "writing"],
                },
                {
                    "modelId": "claude-3-5-haiku-latest",
                    "displayName": "Claude 3.5 Haiku",
                    "traits": ["fast", "cost-efficient", "assistant"],
                },
            ],
        },
        {
            "providerId": "google",
            "displayName": "Google",
            "website": "https://aistudio.google.com",
            "models": [
                {"modelId": "gemini-2.5-pro", "displayName": "Gemini 2.5 Pro", "traits": ["reasoning", "multimodal", "research"]},
                {"modelId": "gemini-2.5-flash", "displayName": "Gemini 2.5 Flash", "traits": ["speed", "low-latency", "assistant"]},
            ],
        },
        {
            "providerId": "deepseek",
            "displayName": "DeepSeek",
            "website": "https://platform.deepseek.com",
            "models": [
                {"modelId": "deepseek-chat", "displayName": "DeepSeek Chat", "traits": ["general", "low-cost", "chat"]},
                {"modelId": "deepseek-reasoner", "displayName": "DeepSeek Reasoner", "traits": ["reasoning", "math", "problem-solving"]},
            ],
        },
        {
            "providerId": "moonshot",
            "displayName": "Moonshot (Kimi)",
            "website": "https://platform.moonshot.cn",
            "models": [
                {"modelId": "moonshot-v1-8k", "displayName": "Moonshot v1 8k", "traits": ["chat", "general", "cost"]},
                {"modelId": "moonshot-v1-128k", "displayName": "Moonshot v1 128k", "traits": ["long-context", "research", "analysis"]},
            ],
        },
        {
            "providerId": "qwen",
            "displayName": "Qwen",
            "website": "https://dashscope.aliyun.com",
            "models": [
                {"modelId": "qwen-plus", "displayName": "Qwen Plus", "traits": ["multilingual", "balanced", "assistant"]},
                {"modelId": "qwen-max", "displayName": "Qwen Max", "traits": ["strong-reasoning", "coding", "complex"]},
            ],
        },
        {
            "providerId": "meta",
            "displayName": "Meta (Llama API Compatible)",
            "website": "https://www.llama.com",
            "models": [
                {"modelId": "llama-3.3-70b-instruct", "displayName": "Llama 3.3 70B Instruct", "traits": ["open-weights", "coding", "assistant"]}
            ],
        },
        {
            "providerId": "mistral",
            "displayName": "Mistral",
            "website": "https://console.mistral.ai",
            "models": [
                {"modelId": "mistral-large-latest", "displayName": "Mistral Large", "traits": ["reasoning", "enterprise", "analysis"]},
                {"modelId": "mistral-small-latest", "displayName": "Mistral Small", "traits": ["fast", "low-cost", "chat"]},
            ],
        },
        {
            "providerId": "xai",
            "displayName": "xAI",
            "website": "https://console.x.ai",
            "models": [
                {"modelId": "grok-3-mini", "displayName": "Grok 3 Mini", "traits": ["chat", "fast", "reasoning"]},
                {"modelId": "grok-3", "displayName": "Grok 3", "traits": ["deep-reasoning", "knowledge", "assistant"]},
            ],
        },
        {
            "providerId": "azure-openai",
            "displayName": "Azure OpenAI",
            "website": "https://portal.azure.com",
            "models": [
                {
                    "modelId": "gpt-4.1 (deployment)",
                    "displayName": "GPT-4.1 Deployment",
                    "traits": ["enterprise", "governance", "secure"],
                }
            ],
        },
        {
            "providerId": "openrouter",
            "displayName": "OpenRouter",
            "website": "https://openrouter.ai",
            "models": [
                {"modelId": "openrouter/auto", "displayName": "OpenRouter Auto", "traits": ["multi-provider", "fallback", "routing"]},
                {
                    "modelId": "anthropic/claude-3.7-sonnet",
                    "displayName": "Claude 3.7 via OpenRouter",
                    "traits": ["quality", "proxy", "flexibility"],
                },
            ],
        },
    ],
    "recommendations": [
        {
            "scene": "效率优先",
            "provider": "OpenAI",
            "modelId": "gpt-4o-mini",
            "reason": "响应快、成本低，适合日常自动化和持续运行。",
        },
        {
            "scene": "代码与工程",
            "provider": "Anthropic",
            "modelId": "claude-3-7-sonnet-latest",
            "reason": "长上下文与工程推理能力强，适合复杂项目执行。",
        },
        {
            "scene": "多模态任务",
            "provider": "Google",
            "modelId": "gemini-2.5-pro",
            "reason": "图文视频混合任务表现均衡。",
        },
        {
            "scene": "成本优先",
            "provider": "DeepSeek",
            "modelId": "deepseek-chat",
            "reason": "成本友好，适合大规模日常调用。",
        },
    ],
}

PACKAGE_SKILLS = {
    "en": {
        "starter-openclaw": [
            "Official OpenClaw base runtime",
            "Mainstream model API setup guidance",
            "Basic health checks and diagnostics",
        ],
        "work-openclaw": [
            "PPT automation skills",
            "Excel / spreadsheet skills",
            "Document writing and organization",
            "Image-model setup guidance",
        ],
        "vision-openclaw": [
            "Video generation and editing workflow",
            "Cross-platform auto-publish workflow",
            "Video-model API setup guidance",
            "Content pipeline templates",
        ],
        "builder-openclaw": [
            "EOW project protocol framework",
            "Engineering collaboration templates",
            "Task checkpoint and traceability defaults",
            "Developer-agent collaboration defaults",
        ],
    },
    "zh": {
        "starter-openclaw": [
            "OpenClaw 官方基础运行环境",
            "主流模型 API 配置引导",
            "基础健康检查与诊断工具",
        ],
        "work-openclaw": [
            "PPT 自动化技能",
            "Excel/表格处理技能",
            "文档写作与整理技能",
            "图片处理模型配置引导",
        ],
        "vision-openclaw": [
            "视频生成与剪辑工作流",
            "跨平台自动发布工作流",
            "视频模型 API 配置引导",
            "内容产线模板",
        ],
        "builder-openclaw": [
            "EOW 项目协议框架",
            "工程协作与交付流程模板",
            "任务检查点与回溯能力",
            "开发型 Agent 协作默认配置",
        ],
    },
    "es": {
        "starter-openclaw": [
            "Runtime base oficial de OpenClaw",
            "Guía de configuración de API para modelos comunes",
            "Diagnóstico y chequeo básico de salud",
        ],
        "work-openclaw": [
            "Automatización de PPT",
            "Habilidades de Excel / hojas de cálculo",
            "Redacción y organización de documentos",
            "Guía para modelos de imagen",
        ],
        "vision-openclaw": [
            "Flujo de generación y edición de video",
            "Publicación automática multiplataforma",
            "Guía de API para modelos de video",
            "Plantillas de producción de contenido",
        ],
        "builder-openclaw": [
            "Marco de protocolo de proyectos EOW",
            "Plantillas de colaboración de ingeniería",
            "Puntos de control y trazabilidad",
            "Configuración para agentes de desarrollo",
        ],
    },
    "ja": {
        "starter-openclaw": [
            "OpenClaw 公式ベースランタイム",
            "主要モデル API 設定ガイド",
            "基本ヘルスチェックと診断",
        ],
        "work-openclaw": [
            "PPT 自動化スキル",
            "Excel / 表計算スキル",
            "ドキュメント作成・整理スキル",
            "画像モデル設定ガイド",
        ],
        "vision-openclaw": [
            "動画生成・編集ワークフロー",
            "マルチプラットフォーム自動配信",
            "動画モデル API 設定ガイド",
            "コンテンツ制作テンプレート",
        ],
        "builder-openclaw": [
            "EOW プロジェクトプロトコル",
            "エンジニア協業テンプレート",
            "タスク追跡とチェックポイント",
            "開発向け Agent 協業設定",
        ],
    },
}

PROFILE_INSTALL_ROOT = {
    "macos-homebrew": "~",
    "linux-systemd": "~",
    "server-docker-compose": "/opt",
}

LANGUAGE_OPTIONS = [
    ("en", "English"),
    ("zh", "中文"),
    ("es", "Español"),
    ("ja", "日本語"),
]

PROFILE_NOTES = {
    "en": {
        "macos-homebrew": {
            "pros": [
                "Easy for personal devices",
                "Fast start with Homebrew ecosystem",
            ],
            "cons": [
                "Less suitable for always-on production",
            ],
        },
        "linux-systemd": {
            "pros": [
                "Stable long-running service",
                "Good for self-hosted home server",
            ],
            "cons": [
                "Requires Linux service operations knowledge",
            ],
        },
        "server-docker-compose": {
            "pros": [
                "Best for deployment and reproducibility",
                "Easy rollback and scaling",
            ],
            "cons": [
                "Needs Docker server resources",
            ],
        },
    },
    "zh": {
        "macos-homebrew": {
            "pros": [
                "个人设备安装更简单",
                "可直接利用 Homebrew 生态快速启动",
            ],
            "cons": [
                "不适合长期稳定在线生产场景",
            ],
        },
        "linux-systemd": {
            "pros": [
                "适合长期稳定运行",
                "适合家庭服务器/自托管场景",
            ],
            "cons": [
                "需要一定 Linux 服务运维能力",
            ],
        },
        "server-docker-compose": {
            "pros": [
                "最适合部署与环境复现",
                "便于回滚、迁移与扩展",
            ],
            "cons": [
                "需要服务器与 Docker 资源",
            ],
        },
    },
    "es": {
        "macos-homebrew": {
            "pros": [
                "Fácil para equipos personales",
                "Arranque rápido con Homebrew",
            ],
            "cons": [
                "Menos adecuado para producción 24/7",
            ],
        },
        "linux-systemd": {
            "pros": [
                "Servicio estable de larga duración",
                "Ideal para servidor casero autogestionado",
            ],
            "cons": [
                "Requiere conocimientos de operación Linux",
            ],
        },
        "server-docker-compose": {
            "pros": [
                "Ideal para despliegue y reproducibilidad",
                "Más fácil de escalar y revertir",
            ],
            "cons": [
                "Requiere recursos de servidor y Docker",
            ],
        },
    },
    "ja": {
        "macos-homebrew": {
            "pros": [
                "個人端末に導入しやすい",
                "Homebrew で素早く開始できる",
            ],
            "cons": [
                "常時稼働の本番用途にはやや不向き",
            ],
        },
        "linux-systemd": {
            "pros": [
                "長時間安定稼働に向く",
                "自宅サーバー運用に適している",
            ],
            "cons": [
                "Linux サービス運用の知識が必要",
            ],
        },
        "server-docker-compose": {
            "pros": [
                "デプロイと再現性に最適",
                "ロールバックや拡張が容易",
            ],
            "cons": [
                "Docker を動かすサーバー資源が必要",
            ],
        },
    },
}

I18N = {
    "en": {
        "app_title": "ELO Claw Installer",
        "hero_title": "ELO Claw Installer",
        "hero_subtitle": "A guided installer for everyone: login, package, model, payment, install, done.",
        "language_pick_title": "Choose Installer Language",
        "language_pick_prompt": "Select your language",
        "language_changed": "Language changed. Installer will restart now.",
        "prev": "Previous",
        "next": "Next",
        "finish": "Finish",
        "step": "Step {index}/{total} · {title}",
        "menu_language": "Language",
        "menu_about": "About",
        "about_text": "ELO Claw Installer\nBuilt for OpenClaw onboarding inside ELO Open World.",
        "version_line": "Installer {installer} · Config {config}",
        "login_title": "Authorization",
        "login_intro": "Login to EOW first. After browser authorization, the installer will continue automatically.",
        "login_btn": "Login to EOW",
        "register_btn": "Go Register",
        "check_auth_btn": "Check Authorization Status",
        "advanced_debug": "Advanced Settings (Debug)",
        "show_advanced": "Show Advanced Settings",
        "hide_advanced": "Hide Advanced Settings",
        "base_url": "EOW Base URL",
        "oauth_client_id": "OAuth Client ID",
        "oauth_scope": "OAuth Scope",
        "oauth_redirect_uri": "OAuth Redirect URI",
        "login": "Login",
        "environment": "Environment",
        "package": "Package",
        "agent": "Agent",
        "model": "Model",
        "chat": "Chat Binding",
        "skills": "Skill Preview",
        "payment": "Payment",
        "install": "Install",
        "complete": "Complete",
        "model_security": "Security: We do not collect, store, or transmit your API Key. It is written locally on your device only.",
        "package_group": "Choose package and environment",
        "package_contains": "Package Includes",
        "environment_notes": "Environment Pros / Cons",
        "package_field": "Package",
        "profile_field": "Environment",
        "auto_register": "Auto-register to EOW after install",
        "package_starter": "Starter OpenClaw ($8)",
        "package_work": "Work OpenClaw ($16)",
        "package_vision": "Vision OpenClaw ($29)",
        "package_builder": "Builder OpenClaw ($79)",
        "profile_macos": "macOS Homebrew",
        "profile_linux": "Linux systemd",
        "profile_server": "Server Docker Compose",
        "pros": "Pros",
        "cons": "Cons",
        "model_provider": "Provider",
        "model_name": "Model",
        "model_api_key": "API Key",
        "open_provider_site": "Open Provider Website",
        "custom_model_toggle": "Use custom model parameters",
        "custom_model_id": "Custom Model ID",
        "custom_base_url": "Custom Base URL",
        "custom_base_url_placeholder": "Optional: Base URL of compatible endpoint",
        "model_recommend": "Recommended for OpenClaw",
        "model_desc_provider": "Provider",
        "model_desc_site": "Website",
        "model_desc_model": "Model",
        "model_desc_traits": "Traits",
        "model_desc_hint": "Tip: start with a recommended model first, then fine-tune inside OpenClaw.",
        "no_recommend": "No recommendation yet.",
        "chat_platform": "Platform",
        "chat_tip": "Guide",
        "chat_title": "Chat App Binding",
        "chat_default_hint": "Choose a chat platform and fill required fields.",
        "chat_guide_title": "Setup Guide",
        "chat_test_button": "Test Chat Configuration",
        "chat_detect_chat_id": "Auto-detect chat_id",
        "chat_bot_token": "Bot Token",
        "chat_chat_id": "Chat ID",
        "chat_webhook": "Webhook URL",
        "chat_secret_optional": "Secret (Optional)",
        "chat_status_ready": "Ready",
        "chat_status_testing": "Testing",
        "chat_status_planned": "Planned",
        "chat_status_testing_hint": "This platform is in testing. Install is allowed.",
        "chat_status_planned_hint": "This platform is planned. Please use a ready/testing platform first.",
        "payment_notice": "One-time payment. Order is completed when Agent [{agent}] installation succeeds.",
        "skill_preview_intro": "You are about to install the following capability set:",
        "auth_start_hint": "Click 'Login to EOW' to start authorization.",
        "auth_status_label": "Authorization Status",
        "current_account_label": "Current Account",
        "token_label": "Access Token",
        "token_ready": "Ready",
        "token_not_ready": "Not ready",
        "note_label": "Note",
        "waiting_callback": "Waiting for browser callback...",
    },
    "zh": {
        "app_title": "ELO 龙虾安装器",
        "hero_title": "ELO 龙虾安装器",
        "hero_subtitle": "面向普通用户的一键引导安装器：登录、选套餐、配置模型、支付、安装、完成。",
        "language_pick_title": "选择安装语言",
        "language_pick_prompt": "请选择语言",
        "language_changed": "语言已切换，安装器将自动重启。",
        "prev": "上一步",
        "next": "下一步",
        "finish": "完成",
        "step": "步骤 {index}/{total} · {title}",
        "menu_language": "语言",
        "menu_about": "关于",
        "about_text": "ELO 龙虾安装器\n用于在 ELO Open World 中快速安装 OpenClaw Agent。",
        "version_line": "安装器 {installer} · 配置 {config}",
        "login_title": "登录授权",
        "login_intro": "请先登录 EOW，浏览器完成授权后安装器会自动继续。",
        "login_btn": "登录到 EOW",
        "register_btn": "去注册",
        "check_auth_btn": "检查授权状态",
        "advanced_debug": "高级设置（调试）",
        "show_advanced": "显示高级设置",
        "hide_advanced": "隐藏高级设置",
        "base_url": "EOW Base URL",
        "oauth_client_id": "OAuth Client ID",
        "oauth_scope": "OAuth Scope",
        "oauth_redirect_uri": "OAuth Redirect URI",
        "login": "登录",
        "environment": "环境检测",
        "package": "套餐",
        "agent": "Agent 信息",
        "model": "模型配置",
        "chat": "聊天绑定",
        "skills": "技能预览",
        "payment": "支付",
        "install": "安装",
        "complete": "完成",
        "model_security": "安全说明：我们不收集、不存储、不传输你的 API Key。该密钥只会在你的设备本地写入配置文件。",
        "package_group": "选择套餐与安装环境",
        "package_contains": "所选套餐包含内容",
        "environment_notes": "所选环境优势与劣势",
        "package_field": "套餐",
        "profile_field": "环境",
        "auto_register": "安装完成后自动注册到 EOW",
        "package_starter": "基础版 OpenClaw ($8)",
        "package_work": "工作版 OpenClaw ($16)",
        "package_vision": "视觉版 OpenClaw ($29)",
        "package_builder": "编程版 OpenClaw ($79)",
        "profile_macos": "macOS Homebrew",
        "profile_linux": "Linux systemd",
        "profile_server": "服务器 Docker Compose",
        "pros": "优势",
        "cons": "劣势",
        "model_provider": "厂牌",
        "model_name": "模型",
        "model_api_key": "API Key",
        "open_provider_site": "打开厂牌官网",
        "custom_model_toggle": "使用自定义模型参数",
        "custom_model_id": "自定义模型 ID",
        "custom_base_url": "自定义 Base URL",
        "custom_base_url_placeholder": "可选：兼容服务的 Base URL",
        "model_recommend": "OpenClaw 推荐模型",
        "model_desc_provider": "厂牌",
        "model_desc_site": "官网",
        "model_desc_model": "模型",
        "model_desc_traits": "特性",
        "model_desc_hint": "提示：可先用推荐模型快速完成安装，后续再在 OpenClaw 内调整。",
        "no_recommend": "暂未提供推荐。",
        "chat_platform": "平台",
        "chat_tip": "提示",
        "chat_title": "聊天软件绑定",
        "chat_default_hint": "请选择聊天平台并填写配置。",
        "chat_guide_title": "操作指引",
        "chat_test_button": "测试聊天配置",
        "chat_detect_chat_id": "自动检测 chat_id",
        "chat_bot_token": "Bot Token",
        "chat_chat_id": "Chat ID",
        "chat_webhook": "Webhook URL",
        "chat_secret_optional": "Secret (可选)",
        "chat_status_ready": "已就绪",
        "chat_status_testing": "测试中",
        "chat_status_planned": "计划中",
        "chat_status_testing_hint": "该平台处于测试中，可继续安装。",
        "chat_status_planned_hint": "该平台尚在计划中，请先使用已就绪/测试中的平台。",
        "payment_notice": "本服务为一次性付费，不支持取消订单。订单以 agent [{agent}] 完成安装为完成标准。",
        "skill_preview_intro": "你即将安装以下能力包：",
        "auth_start_hint": "点击“登录到 EOW”开始授权。",
        "auth_status_label": "登录状态",
        "current_account_label": "当前账号",
        "token_label": "授权令牌",
        "token_ready": "已就绪",
        "token_not_ready": "未就绪",
        "note_label": "提示",
        "waiting_callback": "等待浏览器回调中...",
    },
    "es": {
        "app_title": "Instalador ELO Claw",
        "hero_title": "Instalador ELO Claw",
        "hero_subtitle": "Instalador guiado para todos: inicio de sesión, paquete, modelo, pago e instalación.",
        "language_pick_title": "Seleccionar idioma",
        "language_pick_prompt": "Elige tu idioma",
        "language_changed": "Idioma cambiado. El instalador se reiniciará ahora.",
        "prev": "Anterior",
        "next": "Siguiente",
        "finish": "Finalizar",
        "step": "Paso {index}/{total} · {title}",
        "menu_language": "Idioma",
        "menu_about": "Acerca de",
        "about_text": "Instalador ELO Claw\nOnboarding de OpenClaw para ELO Open World.",
        "version_line": "Instalador {installer} · Config {config}",
        "login_title": "Autorización",
        "login_intro": "Inicia sesión en EOW. Tras autorizar en el navegador, el instalador continuará automáticamente.",
        "login_btn": "Iniciar sesión en EOW",
        "register_btn": "Ir a registro",
        "check_auth_btn": "Verificar autorización",
        "advanced_debug": "Ajustes avanzados (debug)",
        "show_advanced": "Mostrar ajustes avanzados",
        "hide_advanced": "Ocultar ajustes avanzados",
        "base_url": "EOW Base URL",
        "oauth_client_id": "OAuth Client ID",
        "oauth_scope": "OAuth Scope",
        "oauth_redirect_uri": "OAuth Redirect URI",
        "login": "Inicio",
        "environment": "Entorno",
        "package": "Paquete",
        "agent": "Agente",
        "model": "Modelo",
        "chat": "Canal de chat",
        "skills": "Vista de habilidades",
        "payment": "Pago",
        "install": "Instalar",
        "complete": "Finalizado",
        "model_security": "Seguridad: no recopilamos, almacenamos ni transmitimos tu API Key. Solo se escribe localmente.",
        "package_group": "Elegir paquete y entorno",
        "package_contains": "Incluye el paquete",
        "environment_notes": "Pros y contras del entorno",
        "package_field": "Paquete",
        "profile_field": "Entorno",
        "auto_register": "Registrar automáticamente en EOW al finalizar",
        "package_starter": "Starter OpenClaw ($8)",
        "package_work": "Work OpenClaw ($16)",
        "package_vision": "Vision OpenClaw ($29)",
        "package_builder": "Builder OpenClaw ($79)",
        "profile_macos": "macOS Homebrew",
        "profile_linux": "Linux systemd",
        "profile_server": "Servidor Docker Compose",
        "pros": "Pros",
        "cons": "Contras",
        "model_provider": "Proveedor",
        "model_name": "Modelo",
        "model_api_key": "API Key",
        "open_provider_site": "Abrir sitio del proveedor",
        "custom_model_toggle": "Usar parámetros de modelo personalizados",
        "custom_model_id": "ID de modelo personalizado",
        "custom_base_url": "Base URL personalizada",
        "custom_base_url_placeholder": "Opcional: Base URL de endpoint compatible",
        "model_recommend": "Recomendado para OpenClaw",
        "model_desc_provider": "Proveedor",
        "model_desc_site": "Sitio",
        "model_desc_model": "Modelo",
        "model_desc_traits": "Características",
        "model_desc_hint": "Consejo: empieza con un modelo recomendado y luego ajusta en OpenClaw.",
        "no_recommend": "Sin recomendaciones por ahora.",
        "chat_platform": "Plataforma",
        "chat_tip": "Guía",
        "chat_title": "Vinculación de chat",
        "chat_default_hint": "Elige plataforma y completa los campos requeridos.",
        "chat_guide_title": "Guía de configuración",
        "chat_test_button": "Probar configuración de chat",
        "chat_detect_chat_id": "Detectar chat_id automáticamente",
        "chat_bot_token": "Bot Token",
        "chat_chat_id": "Chat ID",
        "chat_webhook": "Webhook URL",
        "chat_secret_optional": "Secret (opcional)",
        "chat_status_ready": "Listo",
        "chat_status_testing": "En prueba",
        "chat_status_planned": "Planificado",
        "chat_status_testing_hint": "Esta plataforma está en prueba. La instalación está permitida.",
        "chat_status_planned_hint": "Esta plataforma está planificada. Usa una plataforma lista/en prueba.",
        "payment_notice": "Pago único. El pedido se completa cuando el Agent [{agent}] termina la instalación.",
        "skill_preview_intro": "Vas a instalar el siguiente conjunto de capacidades:",
        "auth_start_hint": "Pulsa 'Iniciar sesión en EOW' para comenzar la autorización.",
    },
    "ja": {
        "app_title": "ELO Claw インストーラー",
        "hero_title": "ELO Claw インストーラー",
        "hero_subtitle": "ログインから支払い、インストール完了までをガイドするインストーラーです。",
        "language_pick_title": "言語を選択",
        "language_pick_prompt": "使用する言語を選んでください",
        "language_changed": "言語を変更しました。インストーラーを再起動します。",
        "prev": "前へ",
        "next": "次へ",
        "finish": "完了",
        "step": "ステップ {index}/{total} · {title}",
        "menu_language": "言語",
        "menu_about": "情報",
        "about_text": "ELO Claw インストーラー\nELO Open World 向け OpenClaw セットアップ。",
        "version_line": "インストーラー {installer} · 設定 {config}",
        "login_title": "認証ログイン",
        "login_intro": "まず EOW にログインしてください。ブラウザで認可後、インストーラーが自動で続行します。",
        "login_btn": "EOW にログイン",
        "register_btn": "新規登録へ",
        "check_auth_btn": "認証状態を確認",
        "advanced_debug": "詳細設定（デバッグ）",
        "show_advanced": "詳細設定を表示",
        "hide_advanced": "詳細設定を非表示",
        "base_url": "EOW Base URL",
        "oauth_client_id": "OAuth Client ID",
        "oauth_scope": "OAuth Scope",
        "oauth_redirect_uri": "OAuth Redirect URI",
        "login": "ログイン",
        "environment": "環境",
        "package": "パッケージ",
        "agent": "Agent 情報",
        "model": "モデル",
        "chat": "チャット連携",
        "skills": "スキル確認",
        "payment": "支払い",
        "install": "インストール",
        "complete": "完了",
        "model_security": "セキュリティ: API Key は収集・保存・送信しません。端末ローカルにのみ書き込みます。",
        "package_group": "パッケージと環境を選択",
        "package_contains": "パッケージ内容",
        "environment_notes": "環境の長所・短所",
        "package_field": "パッケージ",
        "profile_field": "環境",
        "auto_register": "インストール後に EOW へ自動登録",
        "package_starter": "Starter OpenClaw ($8)",
        "package_work": "Work OpenClaw ($16)",
        "package_vision": "Vision OpenClaw ($29)",
        "package_builder": "Builder OpenClaw ($79)",
        "profile_macos": "macOS Homebrew",
        "profile_linux": "Linux systemd",
        "profile_server": "サーバー Docker Compose",
        "pros": "長所",
        "cons": "短所",
        "model_provider": "プロバイダー",
        "model_name": "モデル",
        "model_api_key": "API Key",
        "open_provider_site": "公式サイトを開く",
        "custom_model_toggle": "カスタムモデル設定を使う",
        "custom_model_id": "カスタムモデル ID",
        "custom_base_url": "カスタム Base URL",
        "custom_base_url_placeholder": "任意: 互換エンドポイントの Base URL",
        "model_recommend": "OpenClaw 推奨モデル",
        "model_desc_provider": "プロバイダー",
        "model_desc_site": "公式サイト",
        "model_desc_model": "モデル",
        "model_desc_traits": "特性",
        "model_desc_hint": "ヒント: まず推奨モデルで始め、後で OpenClaw 内で調整できます。",
        "no_recommend": "推奨モデル情報はまだありません。",
        "chat_platform": "プラットフォーム",
        "chat_tip": "ガイド",
        "chat_title": "チャット連携",
        "chat_default_hint": "チャットサービスを選び、必要項目を入力してください。",
        "chat_guide_title": "操作ガイド",
        "chat_test_button": "チャット設定をテスト",
        "chat_detect_chat_id": "chat_id を自動取得",
        "chat_bot_token": "Bot Token",
        "chat_chat_id": "Chat ID",
        "chat_webhook": "Webhook URL",
        "chat_secret_optional": "Secret (任意)",
        "chat_status_ready": "利用可能",
        "chat_status_testing": "テスト中",
        "chat_status_planned": "計画中",
        "chat_status_testing_hint": "このプラットフォームはテスト中です。インストールは可能です。",
        "chat_status_planned_hint": "このプラットフォームは計画中です。利用可能/テスト中を選択してください。",
        "payment_notice": "本サービスは一回払いです。Agent [{agent}] のインストール完了をもって注文完了となります。",
        "skill_preview_intro": "次の機能セットをインストールします:",
        "auth_start_hint": "「EOW にログイン」をクリックして認証を開始してください。",
    },
}


@dataclass
class InstallerState:
    base_url: str = "https://world.metavie.co"
    human_id: str = ""
    oauth_client_id: str = "eow-installer-desktop"
    oauth_scope: str = "openid profile onboarder.install"
    oauth_redirect_uri: str = "http://127.0.0.1:53682/callback"
    oauth_access_token: str = ""
    oauth_refresh_token: str = ""
    oauth_authorize_state: str = ""
    oauth_code_verifier: str = ""
    oauth_auth_code: str = ""
    installer_auth_status: str = "pending"

    installer_session_id: str = ""
    package_id: str = "starter-openclaw"
    profile: str = "macos-homebrew"
    registration_mode: str = "register-to-eow"

    agent_name: str = ""
    agent_personality: str = ""

    model_provider: str = "OpenAI"
    model_name: str = ""
    model_api_key: str = ""
    model_base_url: str = ""

    chat_platform: str = "telegram"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    feishu_webhook_url: str = ""
    feishu_secret: str = ""
    discord_webhook_url: str = ""
    dingtalk_webhook_url: str = ""
    dingtalk_secret: str = ""

    purchase_id: str = ""
    checkout_session_id: str = ""
    entitlement_id: str = ""
    payment_status: str = "pending"

    install_log: str = ""
    execution_plan: Dict = field(default_factory=dict)
    install_success: bool = False
    install_root: str = ""


class EOWInstaller(QWidget):
    @staticmethod
    def settings_path() -> str:
        return os.path.expanduser("~/.elo_claw_installer.json")

    @classmethod
    def load_saved_language(cls) -> str:
        try:
            with open(cls.settings_path(), "r", encoding="utf-8") as fh:
                payload = json.load(fh)
            lang = str(payload.get("language", "")).strip()
            if lang in {item[0] for item in LANGUAGE_OPTIONS}:
                return lang
        except Exception:
            pass
        return "en"

    @classmethod
    def save_language(cls, language: str):
        try:
            with open(cls.settings_path(), "w", encoding="utf-8") as fh:
                json.dump({"language": language}, fh, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def pick_language(self, start_lang: str) -> str:
        dialog = QDialog()
        dialog.setWindowTitle(self.t("language_pick_title"))
        layout = QVBoxLayout(dialog)
        layout.addWidget(QLabel(self.t("language_pick_prompt")))
        combo = QComboBox()
        for code, label in LANGUAGE_OPTIONS:
            combo.addItem(label, code)
        idx = combo.findData(start_lang)
        combo.setCurrentIndex(idx if idx >= 0 else 0)
        layout.addWidget(combo)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok)
        buttons.accepted.connect(dialog.accept)
        layout.addWidget(buttons)
        dialog.exec()
        return combo.currentData() or start_lang

    def __init__(self):
        super().__init__()
        self.state = InstallerState()
        self.local_installer_version = self.read_local_installer_version()
        self.server_config_version = "-"
        self.remote_installer_config: Dict = {}
        self.remote_chat_platforms: Dict[str, Dict] = {}
        self.remote_model_catalog: Dict = {}
        self.installer_config_loaded = False
        self.current_chat_platform_status = "ready"
        self.telegram_bridge_process: Optional[subprocess.Popen] = None
        self.telegram_bridge_config_path = ""
        self.telegram_bridge_log_path = ""
        self.telegram_bridge_health_path = ""
        initial_lang = self.load_saved_language()
        self.language = initial_lang
        self.language = self.pick_language(initial_lang)
        self.save_language(self.language)
        self.page_title_keys: List[str] = []
        self.page_titles: List[str] = []

        self.loopback_server: Optional[HTTPServer] = None
        self.loopback_thread: Optional[threading.Thread] = None
        self.loopback_host = ""
        self.loopback_port = 0
        self.oauth_callback_path = "/callback"
        self.callback_events: List[Dict] = []
        self.callback_events_lock = threading.Lock()

        self.model_catalog = MODEL_FALLBACK_CATALOG
        self.model_catalog_loaded = False
        self.payment_poll_active = False

        self.setWindowTitle(self.t("app_title"))
        icon_path = self.asset_path("icon.png")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        self.resize(1120, 760)
        self.setMinimumSize(980, 680)
        self.apply_theme()

        self.stack = QStackedWidget()
        self.pages: List[QWidget] = []
        self.current_index = 0

        self.step_label = QLabel()
        self.step_label.setObjectName("stepLabel")

        self.prev_button = QPushButton(self.t("prev"))
        self.next_button = QPushButton(self.t("next"))
        self.prev_button.clicked.connect(self.go_prev)
        self.next_button.clicked.connect(self.go_next)

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 18, 18, 18)
        root.setSpacing(12)

        self.menu_bar = self.build_menu_bar()
        root.addWidget(self.menu_bar)

        hero = self.build_hero_panel()
        root.addWidget(hero)
        root.addWidget(self.step_label)
        root.addWidget(self.stack, 1)

        actions = QHBoxLayout()
        actions.addWidget(self.prev_button)
        actions.addStretch(1)
        actions.addWidget(self.next_button)
        root.addLayout(actions)

        self.build_pages()

        self.auth_poll_timer = QTimer(self)
        self.auth_poll_timer.setInterval(1500)
        self.auth_poll_timer.timeout.connect(self.check_auth_status)

        self.payment_poll_timer = QTimer(self)
        self.payment_poll_timer.setInterval(2500)
        self.payment_poll_timer.timeout.connect(self.poll_payment_status)

        self.refresh_nav()

    def t(self, key: str, **kwargs) -> str:
        localized = I18N.get(self.language, {}).get(key) or I18N["en"].get(key) or key
        return localized.format(**kwargs)

    def read_local_installer_version(self) -> str:
        version_path = self.asset_path("installer_version.json")
        try:
            with open(version_path, "r", encoding="utf-8") as fh:
                payload = json.load(fh)
            commit = str(payload.get("commit", "")).strip() or "unknown"
            built_at = str(payload.get("builtAt", "")).strip()
            label = str(payload.get("version", "")).strip() or commit
            if built_at:
                return f"{label} ({built_at})"
            return label
        except Exception:
            return "dev"

    def localized_i18n(self, data: Dict, fallback: str = "") -> str:
        if not isinstance(data, dict):
            return fallback
        return str(data.get(self.language) or data.get("en") or fallback or "").strip()

    def localized_package_skills(self, package_id: str) -> List[str]:
        remote_contents = self.remote_installer_config.get("packageContentsI18n", {})
        if isinstance(remote_contents, dict):
            lang_pack = remote_contents.get(self.language) or remote_contents.get("en") or {}
            if isinstance(lang_pack, dict):
                values = lang_pack.get(package_id)
                if isinstance(values, list) and values:
                    return [str(item).strip() for item in values if str(item).strip()]
        lang_skills = PACKAGE_SKILLS.get(self.language) or PACKAGE_SKILLS.get("en", {})
        return list(lang_skills.get(package_id, []))

    def localized_profile_notes(self, profile_id: str) -> Dict[str, List[str]]:
        remote_notes = self.remote_installer_config.get("profileNotesI18n", {})
        if isinstance(remote_notes, dict):
            lang_notes = remote_notes.get(self.language) or remote_notes.get("en") or {}
            if isinstance(lang_notes, dict):
                notes = lang_notes.get(profile_id)
                if isinstance(notes, dict):
                    return notes
        lang_notes = PROFILE_NOTES.get(self.language) or PROFILE_NOTES.get("en", {})
        return lang_notes.get(profile_id, {"pros": [], "cons": []})

    def update_version_label(self):
        if hasattr(self, "heroVersion"):
            self.heroVersion.setText(
                self.t(
                    "version_line",
                    installer=self.local_installer_version,
                    config=self.server_config_version
                )
            )

    def load_installer_config(self, force: bool = False, silent: bool = True) -> bool:
        if self.installer_config_loaded and not force:
            return True
        candidate_paths = [
            "/elo-agent-onboarder/appconfig",
            "/api/onboarder/installer/config",
        ]
        try:
            payload = None
            for path in candidate_paths:
                try:
                    payload = self.request(path, method="GET", payload=None)
                except Exception:
                    payload = None
                if isinstance(payload, dict):
                    break
            if isinstance(payload, dict):
                self.remote_installer_config = payload
                self.remote_model_catalog = payload.get("modelCatalog") or {}
                self.server_config_version = str(payload.get("configVersion") or "-")
                self.apply_remote_installer_config(payload)
                self.update_version_label()
                self.installer_config_loaded = True
                return True
        except Exception as exc:
            if not silent:
                self.error(f"加载安装器配置失败：{exc}")
            return False
        return False

    def apply_remote_installer_config(self, payload: Dict):
        catalog = payload.get("packageCatalog") or {}
        packages = catalog.get("packages") or []
        profiles = catalog.get("profiles") or []
        chat_platforms = payload.get("chatPlatforms") or []

        if hasattr(self, "package_combo") and isinstance(packages, list) and packages:
            selected = self.package_combo.currentData() or "starter-openclaw"
            self.package_combo.blockSignals(True)
            self.package_combo.clear()
            for pkg in packages:
                package_id = str(pkg.get("packageId") or "").strip()
                if not package_id:
                    continue
                name = str(pkg.get("displayName") or package_id).strip()
                price = pkg.get("displayPriceUsd")
                if isinstance(price, (int, float)):
                    label = f"{name} (${int(price)})"
                else:
                    label = name
                self.package_combo.addItem(label, package_id)
            restore_index = self.package_combo.findData(selected)
            self.package_combo.setCurrentIndex(restore_index if restore_index >= 0 else 0)
            self.package_combo.blockSignals(False)

        if hasattr(self, "profile_combo") and isinstance(profiles, list) and profiles:
            selected = self.profile_combo.currentData() or "macos-homebrew"
            profile_labels = {
                "macos-homebrew": self.t("profile_macos"),
                "linux-systemd": self.t("profile_linux"),
                "server-docker-compose": self.t("profile_server"),
            }
            self.profile_combo.blockSignals(True)
            self.profile_combo.clear()
            for profile in profiles:
                profile_id = str(profile.get("profileId") or "").strip()
                if not profile_id:
                    continue
                self.profile_combo.addItem(profile_labels.get(profile_id, profile_id), profile_id)
            restore_index = self.profile_combo.findData(selected)
            self.profile_combo.setCurrentIndex(restore_index if restore_index >= 0 else 0)
            self.profile_combo.blockSignals(False)

        self.remote_chat_platforms = {}
        if hasattr(self, "chat_platform_combo") and isinstance(chat_platforms, list) and chat_platforms:
            selected = (self.chat_platform_combo.currentData() or "telegram")
            self.chat_platform_combo.blockSignals(True)
            self.chat_platform_combo.clear()
            status_labels = {
                "ready": self.t("chat_status_ready"),
                "testing": self.t("chat_status_testing"),
                "planned": self.t("chat_status_planned"),
            }
            for item in chat_platforms:
                platform = str(item.get("platform") or "").strip().lower()
                if not platform:
                    continue
                display_name = self.localized_i18n(item.get("displayNameI18n") or {}, platform)
                status = str(item.get("status") or "ready").strip().lower()
                suffix = status_labels.get(status, status_labels["ready"])
                self.chat_platform_combo.addItem(f"{display_name} · {suffix}", platform)
                self.remote_chat_platforms[platform] = item
            restore_index = self.chat_platform_combo.findData(selected)
            self.chat_platform_combo.setCurrentIndex(restore_index if restore_index >= 0 else 0)
            self.chat_platform_combo.blockSignals(False)

        if hasattr(self, "package_combo"):
            self.refresh_package_details()
        if hasattr(self, "chat_platform_combo"):
            self.on_chat_platform_changed()

    def build_menu_bar(self) -> QMenuBar:
        menu = QMenuBar(self)
        self.language_menu = menu.addMenu(self.t("menu_language"))
        self.language_actions = {}
        self.language_action_group = QActionGroup(self)
        self.language_action_group.setExclusive(True)
        for code, label in LANGUAGE_OPTIONS:
            action = QAction(label, self)
            action.setCheckable(True)
            action.setChecked(code == self.language)
            action.triggered.connect(lambda checked=False, lang=code: self.switch_language(lang))
            self.language_action_group.addAction(action)
            self.language_menu.addAction(action)
            self.language_actions[code] = action
        about_action = QAction(self.t("menu_about"), self)
        about_action.triggered.connect(
            lambda: QMessageBox.information(
                self,
                self.t("menu_about"),
                f"{self.t('about_text')}\n\n{self.t('version_line', installer=self.local_installer_version, config=self.server_config_version)}"
            )
        )
        menu.addAction(about_action)
        return menu

    def switch_language(self, language: str):
        if language == self.language:
            return
        self.language = language
        self.save_language(language)
        QMessageBox.information(self, self.t("menu_language"), self.t("language_changed"))
        if getattr(sys, "frozen", False):
            subprocess.Popen([sys.executable])
        else:
            subprocess.Popen([sys.executable, os.path.abspath(__file__)])
        QApplication.quit()

    def apply_theme(self):
        self.setStyleSheet(
            """
            QWidget {
                background: #0b1020;
                color: #e9eefc;
                font-size: 14px;
            }
            QFrame#heroPanel {
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 14px;
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 rgba(56, 23, 104, 0.95),
                    stop:1 rgba(22, 31, 59, 0.95));
                padding: 12px;
            }
            QLabel#heroTitle {
                font-size: 24px;
                font-weight: 700;
            }
            QLabel#heroSubtitle {
                color: #cfd8ff;
            }
            QLabel#heroVersion {
                color: #9fb3f6;
                font-size: 12px;
            }
            QLabel#stepLabel {
                border: 1px solid rgba(124, 93, 255, 0.55);
                border-radius: 10px;
                background: rgba(66, 43, 121, 0.52);
                padding: 8px 12px;
                font-weight: 600;
            }
            QGroupBox {
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                margin-top: 12px;
                padding: 12px;
                background: rgba(14, 21, 41, 0.9);
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 12px;
                padding: 0 6px;
                color: #c3d0ff;
                font-weight: 600;
            }
            QLineEdit, QTextEdit, QComboBox, QListWidget {
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 8px;
                padding: 8px;
                background: rgba(8, 13, 26, 0.9);
                color: #e9eefc;
                selection-background-color: #7d4dff;
                min-height: 42px;
            }
            QTextEdit {
                min-height: 90px;
            }
            QPushButton {
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 8px;
                padding: 9px 14px;
                background: rgba(114, 84, 255, 0.86);
                color: #ffffff;
                font-weight: 600;
                min-height: 42px;
            }
            QPushButton:hover {
                background: rgba(141, 109, 255, 0.92);
            }
            QPushButton:disabled {
                color: rgba(255, 255, 255, 0.4);
                background: rgba(91, 95, 112, 0.4);
                border-color: rgba(255, 255, 255, 0.1);
            }
            QProgressBar {
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 8px;
                background: rgba(8, 13, 26, 0.9);
                text-align: center;
                color: #dce6ff;
                min-height: 22px;
            }
            QProgressBar::chunk {
                border-radius: 7px;
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #7d4dff,
                    stop:1 #ff5a6f);
            }
            """
        )

    def build_hero_panel(self):
        panel = QFrame()
        panel.setObjectName("heroPanel")
        layout = QHBoxLayout(panel)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(14)

        icon_label = QLabel()
        icon_label.setStyleSheet("background: transparent;")
        icon_path = self.asset_path("icon.png")
        if os.path.exists(icon_path):
            icon_label.setPixmap(QIcon(icon_path).pixmap(56, 56))
        layout.addWidget(icon_label, 0, Qt.AlignTop)

        text_col = QVBoxLayout()
        title = QLabel(self.t("hero_title"))
        title.setObjectName("heroTitle")
        subtitle = QLabel(self.t("hero_subtitle"))
        subtitle.setObjectName("heroSubtitle")
        subtitle.setWordWrap(True)
        self.heroVersion = QLabel("")
        self.heroVersion.setObjectName("heroVersion")
        text_col.addWidget(title)
        text_col.addWidget(subtitle)
        text_col.addWidget(self.heroVersion)
        layout.addLayout(text_col, 1)
        self.update_version_label()
        return panel

    def build_pages(self):
        self.add_page("login", self.build_login_page())
        self.add_page("environment", self.build_env_page())
        self.add_page("package", self.build_package_page())
        self.add_page("agent", self.build_agent_page())
        self.add_page("model", self.build_model_page())
        self.add_page("chat", self.build_chat_page())
        self.add_page("skills", self.build_skill_page())
        self.add_page("payment", self.build_payment_page())
        self.add_page("install", self.build_install_page())
        self.add_page("complete", self.build_complete_page())

    def add_page(self, title_key: str, widget: QWidget):
        self.page_title_keys.append(title_key)
        self.page_titles.append(self.t(title_key))
        self.pages.append(widget)
        self.stack.addWidget(widget)

    def refresh_nav(self):
        self.prev_button.setEnabled(self.current_index > 0)
        self.prev_button.setText(self.t("prev"))
        self.next_button.setText(self.t("finish") if self.current_index == len(self.pages) - 1 else self.t("next"))
        self.page_titles = [self.t(key) for key in self.page_title_keys]
        self.step_label.setText(
            self.t("step", index=self.current_index + 1, total=len(self.pages), title=self.page_titles[self.current_index])
        )

    def go_prev(self):
        if self.current_index <= 0:
            return
        self.current_index -= 1
        self.stack.setCurrentIndex(self.current_index)
        self.refresh_nav()

    def go_next(self):
        if not self.validate_current_page():
            return
        if self.current_index >= len(self.pages) - 1:
            self.close()
            return
        self.current_index += 1
        self.stack.setCurrentIndex(self.current_index)
        self.refresh_nav()
        self.on_page_enter()

    def on_page_enter(self):
        title_key = self.page_title_keys[self.current_index]
        if title_key != "login" and self.state.human_id:
            self.ensure_authenticated_session(silent=True)
            self.load_installer_config(silent=True)

        if title_key == "environment":
            self.detect_environment()
        elif title_key == "model":
            self.load_model_catalog()
        elif title_key == "skills":
            self.render_skill_preview()
        elif title_key == "payment":
            self.render_payment_status("请完成支付后继续安装。")
            if self.state.payment_status != "paid":
                self.start_payment_poll()
        elif title_key == "complete":
            self.render_complete_status()

    def validate_current_page(self) -> bool:
        title_key = self.page_title_keys[self.current_index]
        if title_key == "login":
            self.state.base_url = self.base_url_input.text().strip().rstrip("/")
            if self.state.installer_auth_status != "authorized" or not self.state.human_id:
                self.error("请先完成 EOW 登录授权。")
                return False
            self.load_installer_config(force=True, silent=True)
            return self.start_installer_session()

        if title_key == "package":
            desired_package = self.package_combo.currentData() or "starter-openclaw"
            desired_profile = self.profile_combo.currentData() or "macos-homebrew"
            desired_registration = "register-to-eow" if self.registration_checkbox.isChecked() else "local-only"
            if (
                not self.state.installer_session_id
                or self.state.package_id != desired_package
                or self.state.profile != desired_profile
                or self.state.registration_mode != desired_registration
            ):
                return self.start_installer_session()
            return True

        if title_key == "agent":
            if not self.agent_name_input.text().strip():
                self.error("请填写 Agent 名称。")
                return False
            self.state.agent_name = self.agent_name_input.text().strip()
            self.state.agent_personality = self.agent_personality_input.toPlainText().strip()
            return self.update_installer_session()

        if title_key == "model":
            self.state.model_provider = self.model_provider_combo.currentText().strip() or "OpenAI"
            selected_model = self.model_combo.currentData() or self.model_combo.currentText().strip()
            if self.custom_model_checkbox.isChecked() and self.custom_model_name_input.text().strip():
                selected_model = self.custom_model_name_input.text().strip()
            self.state.model_name = str(selected_model).strip()
            self.state.model_base_url = self.custom_model_base_url_input.text().strip()
            self.state.model_api_key = self.model_api_key_input.text().strip()
            if not self.state.model_name:
                self.error("请至少选择一个模型。")
                return False
            if not self.state.model_api_key:
                self.error("请填写模型 API Key。")
                return False
            return self.update_installer_session()

        if title_key == "chat":
            if self.current_chat_platform_status == "planned":
                self.error(self.t("chat_status_planned_hint"))
                return False
            binding = self.collect_chat_binding()
            self.state.chat_platform = binding["platform"]
            self.state.telegram_bot_token = binding.get("telegramBotToken", "")
            self.state.telegram_chat_id = binding.get("telegramChatId", "")
            self.state.feishu_webhook_url = binding.get("feishuWebhookUrl", "")
            self.state.feishu_secret = binding.get("feishuSecret", "")
            self.state.discord_webhook_url = binding.get("discordWebhookUrl", "")
            self.state.dingtalk_webhook_url = binding.get("dingtalkWebhookUrl", "")
            self.state.dingtalk_secret = binding.get("dingtalkSecret", "")
            if self.state.chat_platform == "telegram" and not self.state.telegram_bot_token:
                self.error("Telegram 需要 Bot Token。")
                return False
            if self.state.chat_platform == "feishu" and not self.state.feishu_webhook_url:
                self.error("飞书需要 Webhook URL。")
                return False
            if self.state.chat_platform == "discord" and not self.state.discord_webhook_url:
                self.error("Discord 需要 Webhook URL。")
                return False
            if self.state.chat_platform == "dingtalk" and not self.state.dingtalk_webhook_url:
                self.error("钉钉需要 Webhook URL。")
                return False
            return self.update_installer_session()

        if title_key == "payment":
            if self.state.payment_status != "paid":
                self.error("请先完成 Stripe 支付。")
                return False

        return True

    def ensure_authenticated_session(self, silent: bool = False) -> bool:
        if not self.state.oauth_access_token:
            if not silent:
                self.error("授权令牌不存在，请重新登录。")
            return False
        try:
            me = self.request("/api/auth/me", method="GET", payload=None, require_auth=True)
            human_id = me.get("human", {}).get("humanId", "")
            if human_id:
                self.state.human_id = human_id
                self.state.installer_auth_status = "authorized"
                return True
            raise RuntimeError("授权会话无效")
        except Exception as exc:
            if not silent:
                self.error(f"登录状态已失效，请重新登录。\n\n{exc}")
            self.state.installer_auth_status = "failed"
            self.render_auth_status("登录会话失效，请重新点击“登录到 EOW”。")
            self.stack.setCurrentIndex(0)
            self.current_index = 0
            self.refresh_nav()
            return False

    def request(
        self,
        path: str,
        method: str = "POST",
        payload: Optional[Dict] = None,
        require_auth: bool = True,
        content_type: str = "application/json",
        retry_on_auth_error: bool = True,
    ):
        if require_auth and not (self.state.human_id or self.state.oauth_access_token):
            raise RuntimeError("请先完成登录授权。")

        headers = {}
        if content_type:
            headers["Content-Type"] = content_type

        if self.state.oauth_access_token:
            headers["Authorization"] = f"Bearer {self.state.oauth_access_token}"
        elif self.state.human_id:
            headers["X-ELO-Session-Human-Id"] = self.state.human_id

        url = f"{self.state.base_url}{path}"
        kwargs = {"headers": headers, "timeout": 60}
        if method.upper() == "GET":
            kwargs["params"] = payload or {}
        elif content_type == "application/x-www-form-urlencoded":
            kwargs["data"] = payload or {}
        else:
            kwargs["json"] = payload or {}

        response = requests.request(method, url, **kwargs)

        if response.status_code >= 400:
            message = ""
            try:
                body = response.json()
                message = body.get("error_description") or body.get("error") or response.text
            except Exception:
                message = response.text
            lower_message = str(message).lower()

            if (
                retry_on_auth_error
                and require_auth
                and self.state.oauth_access_token
                and (
                    "access token expired" in lower_message
                    or "invalid access token" in lower_message
                    or "invalid_grant" in lower_message
                )
                and self.refresh_oauth_access_token()
            ):
                return self.request(
                    path,
                    method=method,
                    payload=payload,
                    require_auth=require_auth,
                    content_type=content_type,
                    retry_on_auth_error=False,
                )

            if "access token expired" in lower_message or "invalid access token" in lower_message:
                raise RuntimeError("token_expired: 登录令牌已过期，请重新登录。")
            if "permission" in lower_message or "scope" in lower_message:
                raise RuntimeError(f"permission_denied: {message}")
            raise RuntimeError(f"{response.status_code}: {message}")

        if "application/json" in response.headers.get("Content-Type", ""):
            return response.json()
        return response.content

    def refresh_oauth_access_token(self) -> bool:
        if not self.state.oauth_refresh_token:
            return False
        try:
            token = self.request(
                "/oauth/token",
                method="POST",
                payload={
                    "grant_type": "refresh_token",
                    "refresh_token": self.state.oauth_refresh_token,
                    "client_id": self.state.oauth_client_id,
                },
                require_auth=False,
                content_type="application/x-www-form-urlencoded",
                retry_on_auth_error=False,
            )
            self.state.oauth_access_token = token.get("access_token", "")
            self.state.oauth_refresh_token = token.get("refresh_token", self.state.oauth_refresh_token)
            return bool(self.state.oauth_access_token)
        except Exception:
            return False

    def pkce_challenge(self, verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")

    def parse_loopback_redirect(self):
        parsed = urllib.parse.urlparse(self.oauth_redirect_input.text().strip() or self.state.oauth_redirect_uri)
        if parsed.scheme not in ("http", "https"):
            return None
        if not parsed.hostname or not parsed.port:
            return None
        return {
            "host": parsed.hostname,
            "port": parsed.port,
            "path": parsed.path or "/callback",
        }

    def ensure_loopback_server(self) -> bool:
        conf = self.parse_loopback_redirect()
        if not conf:
            self.render_auth_status("回调地址不合法，请在高级设置中确认 OAuth Redirect URI。")
            return False

        if self.loopback_server and conf["host"] == self.loopback_host and conf["port"] == self.loopback_port:
            self.oauth_callback_path = conf["path"]
            return True

        self.stop_loopback_server()

        installer = self
        callback_path = conf["path"]

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed_url = urllib.parse.urlparse(self.path)
                query = urllib.parse.parse_qs(parsed_url.query)

                if parsed_url.path == callback_path:
                    event = {
                        "type": "oauth",
                        "code": query.get("code", [""])[0],
                        "state": query.get("state", [""])[0],
                        "error": query.get("error", [""])[0],
                    }
                    installer.push_callback_event(event)
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(
                        b"<html><body><h3>EOW authorization received.</h3><p>You can return to the installer.</p></body></html>"
                    )
                    return

                if parsed_url.path == "/checkout-return":
                    event = {
                        "type": "payment-success",
                        "checkoutSessionId": query.get("checkoutSessionId", [""])[0],
                    }
                    installer.push_callback_event(event)
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(
                        b"<html><body><h3>Payment received by installer.</h3><p>You can close this tab and return to the app.</p></body></html>"
                    )
                    return

                if parsed_url.path == "/checkout-cancel":
                    installer.push_callback_event({"type": "payment-cancel"})
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(
                        b"<html><body><h3>Payment cancelled.</h3><p>Return to installer to continue.</p></body></html>"
                    )
                    return

                self.send_response(404)
                self.end_headers()

            def log_message(self, format, *args):
                return

        try:
            server = HTTPServer((conf["host"], conf["port"]), CallbackHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.loopback_server = server
            self.loopback_thread = thread
            self.loopback_host = conf["host"]
            self.loopback_port = conf["port"]
            self.oauth_callback_path = conf["path"]
            return True
        except Exception as exc:
            self.render_auth_status(f"无法启动本地回调监听：{exc}")
            return False

    def stop_loopback_server(self):
        if self.loopback_server:
            try:
                self.loopback_server.shutdown()
                self.loopback_server.server_close()
            except Exception:
                pass
        self.loopback_server = None
        self.loopback_thread = None
        self.loopback_host = ""
        self.loopback_port = 0

    def push_callback_event(self, event: Dict):
        with self.callback_events_lock:
            self.callback_events.append(event)

    def pop_callback_events(self) -> List[Dict]:
        with self.callback_events_lock:
            events = list(self.callback_events)
            self.callback_events.clear()
            return events

    def start_auth_flow(self):
        self.start_oauth_flow()

    def start_oauth_flow(self):
        self.state.base_url = self.base_url_input.text().strip().rstrip("/")
        self.state.oauth_client_id = self.oauth_client_id_input.text().strip() or "eow-installer-desktop"
        self.state.oauth_scope = self.oauth_scope_input.text().strip() or "openid profile onboarder.install"
        self.state.oauth_redirect_uri = self.oauth_redirect_input.text().strip() or "http://127.0.0.1:53682/callback"

        if not self.ensure_loopback_server():
            return

        self.state.oauth_authorize_state = secrets.token_urlsafe(24)
        self.state.oauth_code_verifier = secrets.token_urlsafe(64)
        self.state.oauth_auth_code = ""
        self.state.oauth_access_token = ""
        self.state.oauth_refresh_token = ""
        self.state.human_id = ""
        self.state.installer_auth_status = "pending"

        try:
            authorize_path = (
                "/oauth/authorize?"
                f"response_type=code&client_id={urllib.parse.quote(self.state.oauth_client_id)}"
                f"&redirect_uri={urllib.parse.quote(self.state.oauth_redirect_uri, safe='')}"
                f"&scope={urllib.parse.quote(self.state.oauth_scope)}"
                f"&state={urllib.parse.quote(self.state.oauth_authorize_state)}"
                f"&code_challenge={urllib.parse.quote(self.pkce_challenge(self.state.oauth_code_verifier))}"
                f"&code_challenge_method=S256"
            )
            consent_url = f"{self.state.base_url}/oauth/consent?returnTo={urllib.parse.quote(authorize_path, safe='')}"
            webbrowser.open(consent_url)
            self.auth_poll_timer.start()
            self.render_auth_status("请在浏览器完成登录和授权，应用会自动继续。")
        except Exception as exc:
            self.render_auth_status(f"无法打开浏览器：{exc}")

    def check_auth_status(self):
        for event in self.pop_callback_events():
            if event.get("type") == "oauth":
                if event.get("error"):
                    self.state.installer_auth_status = "failed"
                    self.render_auth_status(f"授权失败：{event.get('error')}")
                    self.auth_poll_timer.stop()
                    return
                if event.get("state") != self.state.oauth_authorize_state:
                    self.state.installer_auth_status = "failed"
                    self.render_auth_status("授权状态校验失败，请重试登录。")
                    self.auth_poll_timer.stop()
                    return
                self.state.oauth_auth_code = event.get("code", "")

            if event.get("type") == "payment-success":
                self.state.checkout_session_id = event.get("checkoutSessionId", self.state.checkout_session_id)
                self.confirm_payment(checkout_session_id=self.state.checkout_session_id, silent=True)
            elif event.get("type") == "payment-cancel":
                self.render_payment_status("支付已取消，你可以重新发起支付。")

        if self.state.oauth_auth_code:
            try:
                if self.exchange_oauth_token():
                    self.auth_poll_timer.stop()
                    self.render_auth_status(f"已授权：{self.state.human_id}")
                    return
            except Exception as exc:
                self.auth_poll_timer.stop()
                self.state.installer_auth_status = "failed"
                self.render_auth_status(f"授权失败：{exc}")
                return

        if self.state.installer_auth_status != "authorized":
            self.render_auth_status(self.t("waiting_callback"))

    def exchange_oauth_token(self):
        if not self.state.oauth_auth_code:
            return False
        token = self.request(
            "/oauth/token",
            method="POST",
            payload={
                "grant_type": "authorization_code",
                "code": self.state.oauth_auth_code,
                "redirect_uri": self.state.oauth_redirect_uri,
                "client_id": self.state.oauth_client_id,
                "code_verifier": self.state.oauth_code_verifier,
            },
            require_auth=False,
            content_type="application/x-www-form-urlencoded",
        )
        self.state.oauth_access_token = token.get("access_token", "")
        self.state.oauth_refresh_token = token.get("refresh_token", "")
        if not self.state.oauth_access_token:
            return False
        me = self.request("/api/auth/me", method="GET", payload=None, require_auth=True)
        self.state.human_id = me.get("human", {}).get("humanId", "")
        self.state.installer_auth_status = "authorized" if self.state.human_id else "pending"
        return bool(self.state.human_id)

    def render_auth_status(self, note: str = ""):
        lines = [
            f"{self.t('auth_status_label')}: {self.state.installer_auth_status}",
            f"{self.t('current_account_label')}: {self.state.human_id or '-'}",
            f"{self.t('token_label')}: {self.t('token_ready') if self.state.oauth_access_token else self.t('token_not_ready')}",
            f"{self.t('note_label')}: {note or self.t('auth_start_hint')}",
        ]
        self.auth_status_box.setPlainText("\n".join(lines))

    def start_installer_session(self) -> bool:
        self.state.package_id = self.package_combo.currentData()
        self.state.profile = self.profile_combo.currentData()
        self.state.registration_mode = "register-to-eow" if self.registration_checkbox.isChecked() else "local-only"
        try:
            result = self.request(
                "/api/onboarder/installer/session/start",
                payload={
                    "packageId": self.state.package_id,
                    "profile": self.state.profile,
                    "registrationMode": self.state.registration_mode,
                    "workflowPreset": "",
                },
            )
            self.state.installer_session_id = result["installerSessionId"]
            return True
        except Exception as exc:
            self.error(str(exc))
            return False

    def collect_chat_binding(self) -> Dict:
        platform_name = str(self.chat_platform_combo.currentData() or self.chat_platform_combo.currentText() or "").strip().lower()
        if platform_name.startswith("feishu"):
            platform_name = "feishu"
        elif platform_name.startswith("dingtalk"):
            platform_name = "dingtalk"
        return {
            "platform": platform_name,
            "telegramBotToken": self.telegram_bot_token_input.text().strip(),
            "telegramChatId": self.telegram_chat_id_input.text().strip(),
            "feishuWebhookUrl": self.feishu_webhook_input.text().strip(),
            "feishuSecret": self.feishu_secret_input.text().strip(),
            "discordWebhookUrl": self.discord_webhook_input.text().strip(),
            "dingtalkWebhookUrl": self.dingtalk_webhook_input.text().strip(),
            "dingtalkSecret": self.dingtalk_secret_input.text().strip(),
        }

    def update_installer_session(self) -> bool:
        try:
            self.request(
                "/api/onboarder/installer/session/update",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "agentName": self.state.agent_name,
                    "agentPersonality": self.state.agent_personality,
                    "modelProvider": self.state.model_provider,
                    "modelName": self.state.model_name,
                    "modelBaseUrl": self.state.model_base_url,
                    "chatBinding": self.collect_chat_binding(),
                },
            )
            return True
        except Exception as exc:
            self.error(str(exc))
            return False

    def parse_checkout_callback_urls(self):
        conf = self.parse_loopback_redirect()
        if not conf:
            return "", ""
        callback_base = f"http://{conf['host']}:{conf['port']}"
        success = f"{callback_base}/checkout-return?installerSessionId={urllib.parse.quote(self.state.installer_session_id)}&checkoutSessionId={{CHECKOUT_SESSION_ID}}"
        cancel = f"{callback_base}/checkout-cancel?installerSessionId={urllib.parse.quote(self.state.installer_session_id)}"
        return success, cancel

    def create_checkout(self):
        if not self.state.installer_session_id:
            self.error("安装会话尚未初始化，请先完成前面步骤。")
            return
        if not self.ensure_authenticated_session(silent=False):
            return
        if not self.ensure_loopback_server():
            return
        try:
            success_url, cancel_url = self.parse_checkout_callback_urls()
            result = self.request(
                "/api/onboarder/installer/payment/checkout-session",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "successUrl": success_url,
                    "cancelUrl": cancel_url,
                },
            )
            self.state.purchase_id = result.get("purchaseId", "")
            self.state.checkout_session_id = result.get("checkoutSessionId", "")
            checkout_url = result.get("checkoutUrl", "")
            if checkout_url:
                webbrowser.open(checkout_url)
            self.render_payment_status("已打开 Stripe 支付页面，支付完成后应用会自动更新状态。")
            self.start_payment_poll()
        except Exception as exc:
            self.render_payment_status(f"创建支付失败：{exc}")

    def check_payment_status(self):
        if not self.state.installer_session_id:
            return
        try:
            result = self.request(
                "/api/onboarder/installer/payment/status",
                payload={"installerSessionId": self.state.installer_session_id},
            )
            self.state.payment_status = result.get("paymentStatus", "pending")
            self.state.purchase_id = result.get("purchaseId", "")
            self.state.checkout_session_id = result.get("checkoutSessionId", self.state.checkout_session_id)
            self.state.entitlement_id = result.get("entitlementId", "")
            if self.state.payment_status == "paid":
                self.payment_poll_timer.stop()
                self.payment_poll_active = False
                self.render_payment_status("支付成功，已解锁安装。")
            else:
                self.render_payment_status("等待支付完成中...")
        except Exception as exc:
            self.render_payment_status(f"支付状态检测失败：{exc}")

    def confirm_payment(self, checkout_session_id: str = "", silent: bool = False):
        if not self.state.installer_session_id:
            return
        try:
            result = self.request(
                "/api/onboarder/installer/payment/confirm",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "checkoutSessionId": checkout_session_id or self.state.checkout_session_id,
                },
            )
            self.state.payment_status = result.get("paymentStatus", "pending")
            self.state.entitlement_id = result.get("entitlementId", "")
            if self.state.payment_status == "paid":
                self.payment_poll_timer.stop()
                self.payment_poll_active = False
                self.render_payment_status("支付成功，已解锁安装。")
            elif not silent:
                self.render_payment_status("支付尚未完成，请稍后再试。")
        except Exception as exc:
            if not silent:
                self.render_payment_status(f"支付确认失败：{exc}")

    def start_payment_poll(self):
        if self.payment_poll_active:
            return
        self.payment_poll_active = True
        self.payment_poll_timer.start()

    def poll_payment_status(self):
        for event in self.pop_callback_events():
            if event.get("type") == "payment-success":
                self.state.checkout_session_id = event.get("checkoutSessionId", self.state.checkout_session_id)
                self.confirm_payment(checkout_session_id=self.state.checkout_session_id, silent=True)
            elif event.get("type") == "payment-cancel":
                self.render_payment_status("支付被取消，可重新发起支付。")
            elif event.get("type") == "oauth":
                # OAuth 事件留给 auth timer 处理
                self.push_callback_event(event)

        self.check_payment_status()

    def render_payment_status(self, note: str = ""):
        if hasattr(self, "payment_notice_label"):
            self.payment_notice_label.setText(self.t("payment_notice", agent=self.state.agent_name or "Agent"))
        state_map = {
            "pending": "待支付",
            "paid": "已支付，可安装",
            "failed": "支付失败",
        }
        status_text = state_map.get(self.state.payment_status, self.state.payment_status)
        lines = [
            f"Installer Session: {self.state.installer_session_id or '-'}",
            f"Purchase: {self.state.purchase_id or '-'}",
            f"Payment Status: {status_text}",
            f"Entitlement: {self.state.entitlement_id or '-'}",
            f"说明: {note or ('支付后应用会自动检测并回到可安装状态。' if self.state.payment_status != 'paid' else '你可以点击 Next 进入安装步骤。')}",
        ]
        self.payment_status_label.setPlainText("\n".join(lines))

    def load_model_catalog(self):
        if self.model_catalog_loaded:
            return
        if isinstance(self.remote_model_catalog, dict) and self.remote_model_catalog.get("providers"):
            self.model_catalog = self.remote_model_catalog
            self.model_catalog_loaded = True
            self.populate_model_providers()
            return
        try:
            catalog = self.request("/api/onboarder/installer/models", method="GET", payload=None)
            providers = catalog.get("providers", [])
            if providers:
                self.model_catalog = catalog
        except Exception:
            self.model_catalog = MODEL_FALLBACK_CATALOG
        self.model_catalog_loaded = True
        self.populate_model_providers()

    def populate_model_providers(self):
        current = self.model_provider_combo.currentText().strip()
        self.model_provider_combo.blockSignals(True)
        self.model_provider_combo.clear()
        for provider in self.model_catalog.get("providers", []):
            self.model_provider_combo.addItem(provider.get("displayName", "Unknown"), provider)
        self.model_provider_combo.blockSignals(False)

        if current:
            idx = self.model_provider_combo.findText(current)
            if idx >= 0:
                self.model_provider_combo.setCurrentIndex(idx)
        if self.model_provider_combo.count() > 0:
            self.on_provider_changed(self.model_provider_combo.currentIndex())

        lines = []
        for rec in self.model_catalog.get("recommendations", []):
            lines.append(
                f"- {rec.get('scene', '')}: {rec.get('provider', '')} / {rec.get('modelId', '')}\n  {rec.get('reason', '')}"
            )
        self.recommendation_output.setPlainText("\n".join(lines) if lines else self.t("no_recommend"))

    def on_provider_changed(self, index: int):
        provider = self.model_provider_combo.itemData(index) or {}
        self.model_combo.blockSignals(True)
        self.model_combo.clear()
        for model in provider.get("models", []):
            self.model_combo.addItem(model.get("displayName", "Unknown"), model.get("modelId", ""))
        self.model_combo.blockSignals(False)
        if self.model_combo.count() > 0:
            self.model_combo.setCurrentIndex(0)
        self.update_model_description()

    def update_model_description(self):
        provider = self.model_provider_combo.currentData() or {}
        model_id = self.model_combo.currentData() or ""
        selected_model = None
        for m in provider.get("models", []):
            if m.get("modelId") == model_id:
                selected_model = m
                break

        provider_name = provider.get("displayName", "-")
        provider_site = provider.get("website", "")
        model_name = selected_model.get("displayName", "-") if selected_model else "-"
        model_traits = ", ".join(selected_model.get("traits", [])) if selected_model else "-"

        self.model_desc.setPlainText(
            "\n".join(
                [
                    f"{self.t('model_desc_provider')}: {provider_name}",
                    f"{self.t('model_desc_site')}: {provider_site or '-'}",
                    f"{self.t('model_desc_model')}: {model_name}",
                    f"{self.t('model_desc_traits')}: {model_traits}",
                    f"\n{self.t('model_desc_hint')}",
                ]
            )
        )

    def open_model_site(self):
        provider = self.model_provider_combo.currentData() or {}
        url = provider.get("website", "")
        if url:
            webbrowser.open(url)

    def toggle_custom_model_fields(self):
        visible = self.custom_model_checkbox.isChecked()
        self.custom_model_wrap.setVisible(visible)

    def detect_environment(self):
        rows = [
            "请确认当前设备环境：",
            f"- 操作系统: {platform.platform()}",
            f"- Python 版本: {platform.python_version()}",
            f"- 当前目录: {os.getcwd()}",
            "- 网络连通: 将在安装时进一步检测",
        ]
        self.env_output.setPlainText("\n".join(rows))

    def on_chat_platform_changed(self):
        platform_name = str(self.chat_platform_combo.currentData() or self.chat_platform_combo.currentText() or "").strip().lower()
        if platform_name.startswith("feishu"):
            platform_name = "feishu"
        elif platform_name.startswith("dingtalk"):
            platform_name = "dingtalk"
        mapping = {
            "telegram": 0,
            "feishu": 1,
            "discord": 2,
            "dingtalk": 3,
        }
        self.chat_stack.setCurrentIndex(mapping.get(platform_name, 0))

        remote = self.remote_chat_platforms.get(platform_name)
        if isinstance(remote, dict):
            status = str(remote.get("status") or "ready").strip().lower()
            if status not in ("ready", "testing", "planned"):
                status = "ready"
            self.current_chat_platform_status = status
            hint = self.localized_i18n(remote.get("hintI18n") or {}, self.t("chat_default_hint"))
            guide = self.localized_i18n(remote.get("guideI18n") or {}, "")
            status_hint = ""
            if status == "testing":
                status_hint = self.t("chat_status_testing_hint")
            elif status == "planned":
                status_hint = self.t("chat_status_planned_hint")
            merged_hint = hint or self.t("chat_default_hint")
            if status_hint:
                merged_hint = f"{merged_hint}\n{status_hint}"
            self.chat_help_label.setText(merged_hint)
            if hasattr(self, "chat_guide_output"):
                self.chat_guide_output.setPlainText(guide)
            return

        self.current_chat_platform_status = "ready"

        hints_by_lang = {
            "en": {
                "telegram": "Telegram needs Bot Token. chat_id can be auto-detected.",
                "feishu": "Feishu(飞书) requires bot Webhook. Fill Secret if signature is enabled.",
                "discord": "Discord uses Webhook URL and is easiest to configure.",
                "dingtalk": "DingTalk(钉钉) requires bot Webhook. Fill Secret if signature is enabled.",
            },
            "zh": {
                "telegram": "Telegram 需要 Bot Token，chat_id 可自动检测。",
                "feishu": "Feishu(飞书) 需要机器人 Webhook；如启用签名校验，请填写 Secret。",
                "discord": "Discord 推荐使用 Webhook URL，配置最简单。",
                "dingtalk": "DingTalk(钉钉) 需要机器人 Webhook；如开启加签，请填写 Secret。",
            },
            "es": {
                "telegram": "Telegram requiere Bot Token; el chat_id puede detectarse automáticamente.",
                "feishu": "Feishu(飞书) requiere Webhook; completa Secret si habilitaste firma.",
                "discord": "Discord usa Webhook URL y es la opción más simple.",
                "dingtalk": "DingTalk(钉钉) requiere Webhook; completa Secret si habilitaste firma.",
            },
            "ja": {
                "telegram": "Telegram は Bot Token が必要です。chat_id は自動取得できます。",
                "feishu": "Feishu(飞书) は Webhook が必要です。署名を有効化している場合は Secret を入力してください。",
                "discord": "Discord は Webhook URL 方式で簡単に設定できます。",
                "dingtalk": "DingTalk(钉钉) は Webhook が必要です。署名を有効化している場合は Secret を入力してください。",
            },
        }
        guides_by_lang = {
            "en": {
                "telegram": (
                    "1. Create a Bot in Telegram and get Bot Token.\n"
                    "2. Send any message to your Bot.\n"
                    "3. Click 'Auto-detect chat_id'.\n"
                    "4. Click 'Test Chat Configuration'."
                ),
                "feishu": (
                    "1. Add custom bot in Feishu group.\n"
                    "2. Copy Webhook URL.\n"
                    "3. If signature is enabled, fill Secret.\n"
                    "4. Click 'Test Chat Configuration'."
                ),
                "discord": (
                    "1. Create a Webhook in Discord channel.\n"
                    "2. Copy Webhook URL.\n"
                    "3. Click 'Test Chat Configuration'."
                ),
                "dingtalk": (
                    "1. Add bot in DingTalk group and copy Webhook URL.\n"
                    "2. If signature is enabled, fill Secret.\n"
                    "3. Click 'Test Chat Configuration'."
                ),
            },
            "zh": {
                "telegram": (
                    "1. 在 Telegram 创建 Bot 并获取 Bot Token。\n"
                    "2. 与 Bot 发送任意消息。\n"
                    "3. 点击“自动检测 chat_id”。\n"
                    "4. 点击“测试聊天配置”验证可达。"
                ),
                "feishu": (
                    "1. 在飞书群添加自定义机器人。\n"
                    "2. 复制 Webhook URL。\n"
                    "3. 如开启签名校验，填写 Secret。\n"
                    "4. 点击“测试聊天配置”验证可达。"
                ),
                "discord": (
                    "1. 在 Discord 频道创建 Webhook。\n"
                    "2. 复制 Webhook URL。\n"
                    "3. 点击“测试聊天配置”验证可达。"
                ),
                "dingtalk": (
                    "1. 在钉钉群添加机器人并获取 Webhook。\n"
                    "2. 若开启“加签”，填写 Secret。\n"
                    "3. 点击“测试聊天配置”验证可达。"
                ),
            },
            "es": {
                "telegram": (
                    "1. Crea un Bot en Telegram y obtén el Bot Token.\n"
                    "2. Envía un mensaje al Bot.\n"
                    "3. Pulsa 'Detectar chat_id automáticamente'.\n"
                    "4. Pulsa 'Probar configuración de chat'."
                ),
                "feishu": (
                    "1. Agrega un bot personalizado en grupo de Feishu.\n"
                    "2. Copia la URL Webhook.\n"
                    "3. Si activaste firma, completa Secret.\n"
                    "4. Pulsa 'Probar configuración de chat'."
                ),
                "discord": (
                    "1. Crea un Webhook en tu canal de Discord.\n"
                    "2. Copia la URL Webhook.\n"
                    "3. Pulsa 'Probar configuración de chat'."
                ),
                "dingtalk": (
                    "1. Agrega bot en grupo de DingTalk y copia Webhook URL.\n"
                    "2. Si activaste firma, completa Secret.\n"
                    "3. Pulsa 'Probar configuración de chat'."
                ),
            },
            "ja": {
                "telegram": (
                    "1. Telegram で Bot を作成し Bot Token を取得します。\n"
                    "2. Bot にメッセージを送信します。\n"
                    "3. 「chat_id を自動取得」をクリックします。\n"
                    "4. 「チャット設定をテスト」をクリックします。"
                ),
                "feishu": (
                    "1. Feishu グループにカスタムボットを追加します。\n"
                    "2. Webhook URL をコピーします。\n"
                    "3. 署名有効時は Secret を入力します。\n"
                    "4. 「チャット設定をテスト」をクリックします。"
                ),
                "discord": (
                    "1. Discord チャンネルで Webhook を作成します。\n"
                    "2. Webhook URL をコピーします。\n"
                    "3. 「チャット設定をテスト」をクリックします。"
                ),
                "dingtalk": (
                    "1. DingTalk グループにボットを追加し Webhook を取得します。\n"
                    "2. 署名有効時は Secret を入力します。\n"
                    "3. 「チャット設定をテスト」をクリックします。"
                ),
            },
        }
        hints = hints_by_lang.get(self.language) or hints_by_lang["en"]
        guides = guides_by_lang.get(self.language) or guides_by_lang["en"]
        self.chat_help_label.setText(hints.get(platform_name, self.t("chat_default_hint")))
        if hasattr(self, "chat_guide_output"):
            self.chat_guide_output.setPlainText(guides.get(platform_name, ""))

    def auto_detect_telegram_chat_id(self):
        bot_token = self.telegram_bot_token_input.text().strip()
        if not bot_token:
            self.chat_validation_output.setPlainText("请先填写 Telegram Bot Token。")
            return
        try:
            response = requests.get(f"https://api.telegram.org/bot{bot_token}/getUpdates", timeout=15)
            payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
            if response.status_code >= 400 or payload.get("ok") is False:
                raise RuntimeError(payload.get("description") or f"HTTP {response.status_code}")
            result = payload.get("result", [])
            latest = None
            for item in reversed(result):
                msg = item.get("message") or item.get("channel_post") or {}
                chat = msg.get("chat") or {}
                if chat.get("id"):
                    latest = str(chat.get("id"))
                    break
            if not latest:
                self.chat_validation_output.setPlainText(
                    "未检测到 chat_id。请先在 Telegram 里给 Bot 发一条消息，然后再次点击自动检测。"
                )
                return
            self.telegram_chat_id_input.setText(latest)
            self.chat_validation_output.setPlainText(f"已自动检测 chat_id: {latest}")
        except Exception as exc:
            self.chat_validation_output.setPlainText(
                "自动检测失败。\n"
                "请确认 Bot Token 正确，并且你已给 Bot 发送过消息。\n"
                f"错误信息: {exc}"
            )

    def test_chat_binding(self):
        if not self.state.installer_session_id:
            self.chat_validation_output.setPlainText("请先完成登录和前置步骤，再进行聊天配置测试。")
            return
        binding = self.collect_chat_binding()
        try:
            result = self.request(
                "/api/onboarder/installer/chat/validate",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "chatBinding": binding,
                    "action": "validate",
                    "message": "ELO Agent Onboarder 测试消息：聊天绑定已生效。",
                },
            )
            self.chat_validation_output.setPlainText(json.dumps(result, indent=2, ensure_ascii=False))
            if result.get("resolvedChatId") and not self.telegram_chat_id_input.text().strip():
                self.telegram_chat_id_input.setText(str(result.get("resolvedChatId")))
        except Exception as exc:
            self.chat_validation_output.setPlainText(f"测试失败: {exc}")

    @staticmethod
    def sanitize_agent_folder_name(name: str) -> str:
        raw = (name or "").strip()
        if not raw:
            return "openclaw"
        cleaned = []
        for ch in raw:
            if ch.isalnum() or ch in ("-", "_", "."):
                cleaned.append(ch)
            else:
                cleaned.append("-")
        folder = "".join(cleaned).strip("-._")
        while "--" in folder:
            folder = folder.replace("--", "-")
        return folder or "openclaw"

    def resolve_install_root(self) -> str:
        base = PROFILE_INSTALL_ROOT.get(self.state.profile, "~")
        base_expanded = os.path.expanduser(base)
        folder_name = f"elo-{self.sanitize_agent_folder_name(self.state.agent_name)}"
        return os.path.join(base_expanded, folder_name)

    def write_local_openclaw_config(self, install_root: str) -> str:
        if not self.state.model_api_key.strip():
            raise RuntimeError("模型 API Key 为空，无法写入本地配置。")
        config_dir = os.path.join(install_root, "config")
        os.makedirs(config_dir, exist_ok=True)
        config_path = os.path.join(config_dir, "openclaw.json")

        config = {}
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as fh:
                config = json.load(fh)
        if not isinstance(config, dict):
            config = {}

        model = config.get("model")
        if not isinstance(model, dict):
            model = {}
        model["provider"] = self.state.model_provider or model.get("provider", "")
        model["name"] = self.state.model_name or model.get("name", "")
        model["apiKey"] = self.state.model_api_key
        if self.state.model_base_url.strip():
            model["baseUrl"] = self.state.model_base_url.strip()
        model.pop("apiKeyRef", None)
        config["model"] = model
        config.setdefault("contract", "openclaw.runtime.config.v1")
        config.setdefault("packageId", self.state.package_id)
        config.setdefault("profile", self.state.profile)
        config.setdefault("registrationMode", self.state.registration_mode)

        with open(config_path, "w", encoding="utf-8") as fh:
            json.dump(config, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        return config_path

    def write_local_guides(self, install_root: str):
        skills = self.localized_package_skills(self.state.package_id)
        safe_path = os.path.join(install_root, "SAFE.md")
        spirit_path = os.path.join(install_root, "SPIRIT.md")
        init_path = os.path.join(install_root, "INIT.md")
        os.makedirs(install_root, exist_ok=True)

        with open(safe_path, "w", encoding="utf-8") as fh:
            fh.write(
                "# SAFE\n\n"
                "## 隐私与安全\n"
                "- 不共享你的 API Key、账号密码和敏感文件。\n"
                "- 执行外部操作前先确认目标与范围。\n"
                "- 仅在必要范围内访问本地文件与网络。\n"
            )
        with open(spirit_path, "w", encoding="utf-8") as fh:
            fh.write(
                "# SPIRIT\n\n"
                "## EOW Spirit\n"
                "- 协作优先，尊重人类意图。\n"
                "- 透明执行，清晰记录关键变更。\n"
                "- 安全可控，避免破坏性操作。\n"
            )
        with open(init_path, "w", encoding="utf-8") as fh:
            fh.write("# INIT\n\n")
            fh.write("## 启动学习计划\n")
            fh.write("1. 阅读 SAFE.md\n")
            fh.write("2. 阅读 SPIRIT.md\n")
            fh.write("3. 学习当前套餐技能：\n")
            if skills:
                for item in skills:
                    fh.write(f"- {item}\n")
            else:
                fh.write("- 基础运行与协作规范\n")
            fh.write("\n学习完成后，可在聊天软件中回复“开始学习技能”继续引导。\n")

    def telegram_bridge_paths(self, install_root: str):
        logs_dir = os.path.join(install_root, "logs")
        os.makedirs(logs_dir, exist_ok=True)
        return (
            os.path.join(logs_dir, "telegram-bridge-config.json"),
            os.path.join(logs_dir, "telegram-bridge.log"),
            os.path.join(logs_dir, "telegram-bridge-health.json"),
            os.path.join(logs_dir, "telegram-bridge.pid"),
        )

    def write_telegram_bridge_config(self, install_root: str, binding: Dict) -> str:
        config_path, log_path, health_path, _ = self.telegram_bridge_paths(install_root)
        payload = {
            "contract": "elo-agent-onboarder.telegram-bridge-config.v1",
            "botToken": binding.get("telegramBotToken", ""),
            "chatId": binding.get("telegramChatId", ""),
            "modelApiKey": self.state.model_api_key,
            "modelName": self.state.model_name,
            "modelProvider": self.state.model_provider,
            "modelBaseUrl": self.state.model_base_url,
            "agentName": self.state.agent_name,
            "agentPersonality": self.state.agent_personality,
            "installRoot": install_root,
            "initGuidePath": os.path.join(install_root, "INIT.md"),
            "logPath": log_path,
            "healthPath": health_path,
        }
        with open(config_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.chmod(config_path, 0o600)
        return config_path

    def read_telegram_bridge_health(self) -> Dict:
        if not self.telegram_bridge_health_path or not os.path.exists(self.telegram_bridge_health_path):
            return {}
        try:
            with open(self.telegram_bridge_health_path, "r", encoding="utf-8") as fh:
                payload = json.load(fh)
            if isinstance(payload, dict):
                return payload
        except Exception:
            pass
        return {}

    def refresh_telegram_bridge_status(self):
        if not hasattr(self, "bridge_status_label"):
            return
        health = self.read_telegram_bridge_health()
        if self.state.chat_platform != "telegram":
            self.bridge_status_label.setText("消息服务: 当前非 Telegram，无需桥接。")
            return
        running = bool(health.get("running"))
        last_message = str(health.get("lastMessageAt", "-"))
        last_error = str(health.get("lastError", ""))
        if running:
            text_line = f"消息服务: 运行中（lastMessageAt={last_message}）"
        else:
            text_line = "消息服务: 未运行"
        if last_error:
            text_line = f"{text_line}\n最近错误: {last_error}"
        self.bridge_status_label.setText(text_line)

    def start_telegram_bridge(self, install_root: str, binding: Dict):
        if (binding.get("platform") or "") != "telegram":
            return False, "skip"
        if not binding.get("telegramBotToken"):
            raise RuntimeError("Telegram Bot Token 为空，无法启动消息桥接。")
        config_path = self.write_telegram_bridge_config(install_root, binding)
        config_path, log_path, health_path, pid_path = self.telegram_bridge_paths(install_root)
        cmd = [sys.executable]
        if not getattr(sys, "frozen", False):
            cmd.append(os.path.abspath(__file__))
        cmd.extend(["--telegram-bridge", "--config", config_path, "--log", log_path, "--health", health_path])
        kwargs = {
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
            "start_new_session": True,
        }
        if sys.platform.startswith("win"):
            kwargs["creationflags"] = 0x08000000
        proc = subprocess.Popen(cmd, **kwargs)
        self.telegram_bridge_process = proc
        self.telegram_bridge_config_path = config_path
        self.telegram_bridge_log_path = log_path
        self.telegram_bridge_health_path = health_path
        try:
            with open(pid_path, "w", encoding="utf-8") as fh:
                fh.write(str(proc.pid))
        except Exception:
            pass
        return True, f"pid={proc.pid}"

    def restart_telegram_bridge(self):
        if self.state.chat_platform != "telegram":
            self.error("当前不是 Telegram 平台，无需重启消息桥接。")
            return
        try:
            if self.telegram_bridge_process and self.telegram_bridge_process.poll() is None:
                self.telegram_bridge_process.terminate()
        except Exception:
            pass
        try:
            binding = self.collect_chat_binding()
            ok, detail = self.start_telegram_bridge(self.state.install_root or self.resolve_install_root(), binding)
            self.refresh_telegram_bridge_status()
            if ok:
                QMessageBox.information(self, "Bridge", f"Telegram 消息桥接已重启（{detail}）。")
        except Exception as exc:
            self.error(f"重启 Telegram 消息桥接失败：{exc}")

    def open_telegram_bridge_log(self):
        if not self.telegram_bridge_log_path:
            self.error("消息桥接日志路径未就绪。")
            return
        try:
            if sys.platform.startswith("darwin"):
                subprocess.Popen(["open", self.telegram_bridge_log_path])
            elif sys.platform.startswith("win"):
                os.startfile(self.telegram_bridge_log_path)
            else:
                subprocess.Popen(["xdg-open", self.telegram_bridge_log_path])
        except Exception as exc:
            self.error(f"无法打开日志：{exc}")

    def open_openclaw_gateway(self):
        runtime = self.state.execution_plan.get("runtime", {}) if isinstance(self.state.execution_plan, dict) else {}
        endpoint = runtime.get("endpoint") if isinstance(runtime, dict) else ""
        webbrowser.open(endpoint or "http://127.0.0.1:18789")

    def stage_update(self, label: str, percent: int, detail: str = ""):
        self.install_status_label.setText(label)
        self.install_progress.setValue(percent)
        line = f"[{percent:>3}%] {label}"
        if detail:
            line = f"{line} - {detail}"
        self.install_stage_list.addItem(line)
        self.install_stage_list.scrollToBottom()
        QApplication.processEvents()

    def run_install(self):
        if self.state.install_success and self.install_start_button.text() == "开启你的智能时代":
            self.open_openclaw_gateway()
            return
        if self.state.payment_status != "paid":
            self.error("请先完成支付。")
            return
        self.install_start_button.setEnabled(False)
        self.install_start_button.setText("正在安装")
        self.prev_button.setEnabled(False)
        self.next_button.setEnabled(False)

        self.install_stage_list.clear()
        self.install_log_output.clear()
        self.state.install_success = False
        self.state.install_log = ""

        try:
            self.stage_update("环境检查", 8, "准备安装执行上下文")
            env_report = {
                "platform": platform.platform(),
                "python": platform.python_version(),
            }

            self.stage_update("获取安装计划", 22, "从 EOW 拉取安装计划")
            plan_payload = self.request(
                "/api/onboarder/installer/plan",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "worldUrl": self.state.base_url,
                },
            )
            self.state.execution_plan = plan_payload.get("plan", {})

            self.stage_update("下载执行脚本", 38, "准备一次性安装脚本")
            script_payload = self.request(
                "/api/onboarder/installer/script",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "worldUrl": self.state.base_url,
                },
            )
            script = script_payload.get("script", "")
            if not script:
                raise RuntimeError("服务器返回的安装脚本为空。")

            install_root = self.resolve_install_root()
            self.state.install_root = install_root
            self.stage_update("安装 OpenClaw", 60, "执行安装脚本并生成配置")
            with tempfile.TemporaryDirectory(prefix="eow-installer-") as td:
                script_path = os.path.join(td, "install.sh")
                with open(script_path, "w", encoding="utf-8") as fp:
                    fp.write(script)
                os.chmod(script_path, 0o700)

                cmd = ["bash", script_path, install_root] if platform.system().lower().startswith("win") else [script_path, install_root]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
                self.state.install_log = f"exit={proc.returncode}\n\nSTDOUT:\n{proc.stdout}\n\nSTDERR:\n{proc.stderr}"
                self.install_log_output.setPlainText(self.state.install_log)
                if proc.returncode != 0:
                    raise RuntimeError("安装脚本执行失败，请查看日志。")

            self.stage_update("写入本地配置", 76, "在本地写入 openclaw.json（不上传 API Key）")
            config_path = self.write_local_openclaw_config(install_root)
            self.write_local_guides(install_root)

            self.stage_update("聊天通道通知", 90, "发送安装成功消息")
            binding = self.collect_chat_binding()
            try:
                self.request(
                    "/api/onboarder/installer/chat/validate",
                    payload={
                        "installerSessionId": self.state.installer_session_id,
                        "chatBinding": binding,
                        "action": "notify",
                        "message": (
                            f"OpenClaw 安装成功。Agent={self.state.agent_name}，Model={self.state.model_name}\n"
                            "是否开始学习套餐内技能？回复“开始学习技能”即可。"
                        ),
                    },
                )
            except Exception as notify_exc:
                self.install_stage_list.addItem(f"[warn] 聊天通知发送失败: {notify_exc}")

            if binding.get("platform") == "telegram":
                self.stage_update("启动 Telegram 消息桥接", 95, "开启双向收发消息服务")
                bridge_ok, bridge_detail = self.start_telegram_bridge(install_root, binding)
                if not bridge_ok:
                    raise RuntimeError(f"Telegram 消息桥接启动失败：{bridge_detail}")

            self.request(
                "/api/onboarder/installer/complete",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "installReport": {
                        "ok": True,
                        "platform": platform.platform(),
                        "env": env_report,
                    },
                },
            )

            self.state.install_success = True
            self.stage_update("安装完成", 100, "你可以进入最后一步并注册到 EOW")
            self.install_status_label.setText(f"安装成功！本地配置已写入：{config_path}")
            self.install_start_button.setText("开启你的智能时代")
            self.refresh_telegram_bridge_status()
        except Exception as exc:
            self.install_status_label.setText(f"安装失败：{exc}")
            self.install_stage_list.addItem(f"[error] {exc}")
            self.install_start_button.setText("重新安装")
        finally:
            self.state.model_api_key = ""
            self.model_api_key_input.clear()
            self.install_start_button.setEnabled(True)
            self.prev_button.setEnabled(True)
            self.next_button.setEnabled(True)

    def open_install_folder(self):
        target = self.state.install_root or self.resolve_install_root()
        try:
            if sys.platform.startswith("darwin"):
                subprocess.Popen(["open", target])
            elif sys.platform.startswith("win"):
                os.startfile(target)
            else:
                subprocess.Popen(["xdg-open", target])
        except Exception as exc:
            self.error(f"无法打开目录：{exc}")

    def register_to_world(self):
        try:
            result = self.request(
                "/api/onboarder/installer/register",
                payload={"installerSessionId": self.state.installer_session_id},
            )
            self.complete_status_output.setPlainText(json.dumps(result, indent=2, ensure_ascii=False))
        except Exception as exc:
            self.error(str(exc))

    def render_skill_preview(self):
        package = self.package_combo.currentData()
        skills = self.localized_package_skills(package)
        text_lines = [self.t("skill_preview_intro"), ""]
        text_lines.extend([f"- {item}" for item in skills])
        self.skill_output.setPlainText("\n".join(text_lines))

    def render_complete_status(self):
        summary = {
            "installerSessionId": self.state.installer_session_id,
            "humanId": self.state.human_id,
            "package": self.state.package_id,
            "paymentStatus": self.state.payment_status,
            "entitlementId": self.state.entitlement_id,
            "installSuccess": self.state.install_success,
            "profile": self.state.profile,
            "registrationMode": self.state.registration_mode,
            "chatPlatform": self.state.chat_platform,
            "telegramBridgeLog": self.telegram_bridge_log_path or "",
            "telegramBridgeHealth": self.telegram_bridge_health_path or "",
        }
        headline = "安装成功，Agent 已准备就绪。" if self.state.install_success else "安装尚未完成，请返回安装步骤。"
        self.complete_headline.setText(headline)
        self.complete_status_output.setPlainText(json.dumps(summary, indent=2, ensure_ascii=False))
        self.refresh_telegram_bridge_status()

    def error(self, message: str):
        QMessageBox.critical(self, "Error", message)

    @staticmethod
    def asset_path(filename: str) -> str:
        if getattr(sys, "frozen", False):
            base = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
        else:
            base = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(base, "assets", filename)

    def build_login_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        card = QGroupBox(self.t("login_title"))
        card_layout = QVBoxLayout(card)
        card_layout.addWidget(QLabel(self.t("login_intro")))

        actions = QHBoxLayout()
        login_btn = QPushButton(self.t("login_btn"))
        register_btn = QPushButton(self.t("register_btn"))
        check_btn = QPushButton(self.t("check_auth_btn"))
        login_btn.clicked.connect(self.start_auth_flow)
        register_btn.clicked.connect(lambda: webbrowser.open(f"{self.base_url_input.text().strip().rstrip('/')}/human-auth"))
        check_btn.clicked.connect(self.check_auth_status)
        actions.addWidget(login_btn)
        actions.addWidget(register_btn)
        actions.addWidget(check_btn)
        card_layout.addLayout(actions)

        self.auth_status_box = QTextEdit()
        self.auth_status_box.setReadOnly(True)
        self.auth_status_box.setMinimumHeight(120)
        card_layout.addWidget(self.auth_status_box)
        layout.addWidget(card)

        advanced_group = QGroupBox(self.t("advanced_debug"))
        adv_layout = QFormLayout(advanced_group)
        self.base_url_input = QLineEdit(self.state.base_url)
        self.oauth_client_id_input = QLineEdit(self.state.oauth_client_id)
        self.oauth_scope_input = QLineEdit(self.state.oauth_scope)
        self.oauth_redirect_input = QLineEdit(self.state.oauth_redirect_uri)
        adv_layout.addRow(self.t("base_url"), self.base_url_input)
        adv_layout.addRow(self.t("oauth_client_id"), self.oauth_client_id_input)
        adv_layout.addRow(self.t("oauth_scope"), self.oauth_scope_input)
        adv_layout.addRow(self.t("oauth_redirect_uri"), self.oauth_redirect_input)

        self.advanced_toggle_btn = QToolButton()
        self.advanced_toggle_btn.setText(self.t("show_advanced"))
        self.advanced_toggle_btn.setCheckable(True)
        self.advanced_toggle_btn.toggled.connect(lambda checked: self.on_advanced_toggle(checked, advanced_group))
        advanced_group.setVisible(False)
        layout.addWidget(self.advanced_toggle_btn)
        layout.addWidget(advanced_group)

        self.render_auth_status(self.t("auth_start_hint"))
        return page

    def on_advanced_toggle(self, checked: bool, group: QGroupBox):
        group.setVisible(checked)
        self.advanced_toggle_btn.setText(self.t("hide_advanced") if checked else self.t("show_advanced"))

    def build_env_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        card = QGroupBox("环境检测")
        card_layout = QVBoxLayout(card)
        card_layout.addWidget(QLabel("安装器会先检查当前设备环境，确保安装流程顺畅。"))
        detect_btn = QPushButton("重新检测环境")
        detect_btn.clicked.connect(self.detect_environment)
        self.env_output = QTextEdit()
        self.env_output.setReadOnly(True)
        card_layout.addWidget(detect_btn)
        card_layout.addWidget(self.env_output)
        layout.addWidget(card)
        return page

    def build_package_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        form_box = QGroupBox(self.t("package_group"))
        form = QFormLayout(form_box)
        self.package_combo = QComboBox()
        self.package_combo.addItem(self.t("package_starter"), "starter-openclaw")
        self.package_combo.addItem(self.t("package_work"), "work-openclaw")
        self.package_combo.addItem(self.t("package_vision"), "vision-openclaw")
        self.package_combo.addItem(self.t("package_builder"), "builder-openclaw")
        self.package_combo.setMinimumWidth(480)
        self.package_combo.currentIndexChanged.connect(self.refresh_package_details)

        self.profile_combo = QComboBox()
        self.profile_combo.addItem(self.t("profile_macos"), "macos-homebrew")
        self.profile_combo.addItem(self.t("profile_linux"), "linux-systemd")
        self.profile_combo.addItem(self.t("profile_server"), "server-docker-compose")
        self.profile_combo.setMinimumWidth(480)
        self.profile_combo.currentIndexChanged.connect(self.refresh_package_details)

        self.registration_checkbox = QCheckBox(self.t("auto_register"))
        self.registration_checkbox.setChecked(True)

        form.addRow(self.t("package_field"), self.package_combo)
        form.addRow(self.t("profile_field"), self.profile_combo)
        form.addRow("", self.registration_checkbox)
        layout.addWidget(form_box)

        info_row = QHBoxLayout()
        package_box = QGroupBox(self.t("package_contains"))
        package_layout = QVBoxLayout(package_box)
        self.package_detail_output = QTextEdit()
        self.package_detail_output.setReadOnly(True)
        package_layout.addWidget(self.package_detail_output)

        profile_box = QGroupBox(self.t("environment_notes"))
        profile_layout = QVBoxLayout(profile_box)
        self.profile_detail_output = QTextEdit()
        self.profile_detail_output.setReadOnly(True)
        profile_layout.addWidget(self.profile_detail_output)

        info_row.addWidget(package_box, 1)
        info_row.addWidget(profile_box, 1)
        layout.addLayout(info_row)
        self.refresh_package_details()
        return page

    def refresh_package_details(self):
        package_id = self.package_combo.currentData() if hasattr(self, "package_combo") else "starter-openclaw"
        package_items = self.localized_package_skills(package_id)
        package_lines = [f"- {item}" for item in package_items]
        self.package_detail_output.setPlainText("\n".join(package_lines) if package_lines else "-")

        profile_id = self.profile_combo.currentData() if hasattr(self, "profile_combo") else "macos-homebrew"
        profile = self.localized_profile_notes(profile_id)
        lines = [f"{self.t('pros')}:"]
        lines.extend([f"- {item}" for item in profile.get("pros", [])] or ["-"])
        lines.append("")
        lines.append(f"{self.t('cons')}:")
        lines.extend([f"- {item}" for item in profile.get("cons", [])] or ["-"])
        self.profile_detail_output.setPlainText("\n".join(lines))

    def build_agent_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        form_box = QGroupBox("Agent 信息")
        form = QFormLayout(form_box)
        self.agent_name_input = QLineEdit()
        self.agent_personality_input = QTextEdit()
        self.agent_personality_input.setPlaceholderText("例如：耐心、执行力强、善于整理信息。安装时会写入 SOUL.md")

        form.addRow("Agent 名称", self.agent_name_input)
        form.addRow("Agent 性格", self.agent_personality_input)
        layout.addWidget(form_box)
        return page

    def build_model_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        form_box = QGroupBox(self.t("model"))
        form = QFormLayout(form_box)

        self.model_provider_combo = QComboBox()
        self.model_provider_combo.currentIndexChanged.connect(self.on_provider_changed)

        self.model_combo = QComboBox()
        self.model_combo.currentIndexChanged.connect(lambda _: self.update_model_description())

        self.model_api_key_input = QLineEdit()
        self.model_api_key_input.setEchoMode(QLineEdit.Password)

        form.addRow(self.t("model_provider"), self.model_provider_combo)
        form.addRow(self.t("model_name"), self.model_combo)
        form.addRow(self.t("model_api_key"), self.model_api_key_input)
        model_security_notice = QLabel(self.t("model_security"))
        model_security_notice.setWordWrap(True)
        form.addRow("", model_security_notice)

        open_site_btn = QPushButton(self.t("open_provider_site"))
        open_site_btn.clicked.connect(self.open_model_site)
        form.addRow("", open_site_btn)

        self.custom_model_checkbox = QCheckBox(self.t("custom_model_toggle"))
        self.custom_model_checkbox.toggled.connect(self.toggle_custom_model_fields)
        form.addRow("", self.custom_model_checkbox)

        self.custom_model_wrap = QWidget()
        custom_form = QFormLayout(self.custom_model_wrap)
        self.custom_model_name_input = QLineEdit()
        self.custom_model_base_url_input = QLineEdit()
        self.custom_model_base_url_input.setPlaceholderText(self.t("custom_base_url_placeholder"))
        custom_form.addRow(self.t("custom_model_id"), self.custom_model_name_input)
        custom_form.addRow(self.t("custom_base_url"), self.custom_model_base_url_input)
        self.custom_model_wrap.setVisible(False)
        form.addRow("", self.custom_model_wrap)

        content_row = QHBoxLayout()
        content_row.addWidget(form_box, 4)

        info_col = QVBoxLayout()
        self.model_desc = QTextEdit()
        self.model_desc.setReadOnly(True)
        info_col.addWidget(self.model_desc, 2)

        rec_box = QGroupBox(self.t("model_recommend"))
        rec_layout = QVBoxLayout(rec_box)
        self.recommendation_output = QTextEdit()
        self.recommendation_output.setReadOnly(True)
        rec_layout.addWidget(self.recommendation_output)
        info_col.addWidget(rec_box, 3)

        content_row.addLayout(info_col, 3)
        layout.addLayout(content_row)

        return page

    def build_chat_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        top_box = QGroupBox(self.t("chat_title"))
        top_form = QFormLayout(top_box)
        self.chat_platform_combo = QComboBox()
        self.chat_platform_combo.addItem("Telegram", "telegram")
        self.chat_platform_combo.addItem("Feishu(飞书)", "feishu")
        self.chat_platform_combo.addItem("Discord", "discord")
        self.chat_platform_combo.addItem("DingTalk(钉钉)", "dingtalk")
        self.chat_platform_combo.currentTextChanged.connect(lambda _: self.on_chat_platform_changed())
        self.chat_help_label = QLabel(self.t("chat_default_hint"))
        self.chat_help_label.setWordWrap(True)
        top_form.addRow(self.t("chat_platform"), self.chat_platform_combo)
        top_form.addRow(self.t("chat_tip"), self.chat_help_label)

        layout.addWidget(top_box)

        content_row = QHBoxLayout()
        self.chat_stack = QStackedWidget()

        telegram_widget = QWidget()
        telegram_form = QFormLayout(telegram_widget)
        self.telegram_bot_token_input = QLineEdit()
        self.telegram_chat_id_input = QLineEdit()
        self.telegram_detect_btn = QPushButton(self.t("chat_detect_chat_id"))
        self.telegram_detect_btn.clicked.connect(self.auto_detect_telegram_chat_id)
        telegram_form.addRow(self.t("chat_bot_token"), self.telegram_bot_token_input)
        telegram_form.addRow(self.t("chat_chat_id"), self.telegram_chat_id_input)
        telegram_form.addRow("", self.telegram_detect_btn)

        feishu_widget = QWidget()
        feishu_form = QFormLayout(feishu_widget)
        self.feishu_webhook_input = QLineEdit()
        self.feishu_secret_input = QLineEdit()
        self.feishu_secret_input.setEchoMode(QLineEdit.Password)
        feishu_form.addRow(self.t("chat_webhook"), self.feishu_webhook_input)
        feishu_form.addRow(self.t("chat_secret_optional"), self.feishu_secret_input)

        discord_widget = QWidget()
        discord_form = QFormLayout(discord_widget)
        self.discord_webhook_input = QLineEdit()
        discord_form.addRow(self.t("chat_webhook"), self.discord_webhook_input)

        dingtalk_widget = QWidget()
        dingtalk_form = QFormLayout(dingtalk_widget)
        self.dingtalk_webhook_input = QLineEdit()
        self.dingtalk_secret_input = QLineEdit()
        self.dingtalk_secret_input.setEchoMode(QLineEdit.Password)
        dingtalk_form.addRow(self.t("chat_webhook"), self.dingtalk_webhook_input)
        dingtalk_form.addRow(self.t("chat_secret_optional"), self.dingtalk_secret_input)

        self.chat_stack.addWidget(telegram_widget)
        self.chat_stack.addWidget(feishu_widget)
        self.chat_stack.addWidget(discord_widget)
        self.chat_stack.addWidget(dingtalk_widget)
        self.chat_stack.setMinimumHeight(240)
        content_row.addWidget(self.chat_stack, 3)

        guide_box = QGroupBox(self.t("chat_guide_title"))
        guide_layout = QVBoxLayout(guide_box)
        self.chat_guide_output = QTextEdit()
        self.chat_guide_output.setReadOnly(True)
        self.chat_guide_output.setMinimumHeight(240)
        guide_layout.addWidget(self.chat_guide_output)
        content_row.addWidget(guide_box, 2)
        layout.addLayout(content_row)

        test_btn = QPushButton(self.t("chat_test_button"))
        test_btn.clicked.connect(self.test_chat_binding)
        layout.addWidget(test_btn)

        self.chat_validation_output = QTextEdit()
        self.chat_validation_output.setReadOnly(True)
        layout.addWidget(self.chat_validation_output)

        self.on_chat_platform_changed()
        return page

    def build_skill_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        box = QGroupBox("技能套餐预览")
        box_layout = QVBoxLayout(box)
        self.skill_output = QTextEdit()
        self.skill_output.setReadOnly(True)
        box_layout.addWidget(self.skill_output)
        layout.addWidget(box)
        return page

    def build_payment_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        box = QGroupBox("Stripe 支付")
        box_layout = QVBoxLayout(box)

        self.payment_notice_label = QLabel(self.t("payment_notice", agent=self.state.agent_name or "Agent"))
        self.payment_notice_label.setWordWrap(True)
        box_layout.addWidget(self.payment_notice_label)

        self.payment_status_label = QTextEdit()
        self.payment_status_label.setReadOnly(True)
        self.payment_status_label.setMinimumHeight(140)

        btn_checkout = QPushButton("Open Stripe Checkout")
        btn_recheck = QPushButton("Check Payment Status")
        btn_confirm = QPushButton("Confirm Checkout")

        btn_checkout.clicked.connect(self.create_checkout)
        btn_recheck.clicked.connect(self.check_payment_status)
        btn_confirm.clicked.connect(lambda: self.confirm_payment())

        box_layout.addWidget(self.payment_status_label)
        box_layout.addWidget(btn_checkout)
        box_layout.addWidget(btn_recheck)
        box_layout.addWidget(btn_confirm)
        layout.addWidget(box)
        return page

    def build_install_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        box = QGroupBox("安装执行")
        box_layout = QVBoxLayout(box)

        self.install_status_label = QLabel("准备安装。")
        self.install_progress = QProgressBar()
        self.install_progress.setRange(0, 100)
        self.install_progress.setValue(0)
        self.install_stage_list = QListWidget()

        self.install_start_button = QPushButton("开始安装")
        self.install_start_button.clicked.connect(self.run_install)

        self.install_log_output = QTextEdit()
        self.install_log_output.setReadOnly(True)

        box_layout.addWidget(self.install_status_label)
        box_layout.addWidget(self.install_progress)
        box_layout.addWidget(self.install_stage_list)
        box_layout.addWidget(self.install_start_button)
        box_layout.addWidget(self.install_log_output)
        layout.addWidget(box)

        return page

    def build_complete_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        box = QGroupBox("安装完成")
        box_layout = QVBoxLayout(box)

        self.complete_headline = QLabel("安装尚未完成")
        self.complete_status_output = QTextEdit()
        self.complete_status_output.setReadOnly(True)
        self.bridge_status_label = QLabel("消息服务: 未启动")
        self.bridge_status_label.setWordWrap(True)

        actions = QHBoxLayout()
        register_btn = QPushButton("Register to EOW")
        register_btn.clicked.connect(self.register_to_world)
        open_world_btn = QPushButton("Open EOW Settings")
        open_world_btn.clicked.connect(lambda: webbrowser.open(f"{self.state.base_url}/#settings"))
        open_folder_btn = QPushButton("打开安装目录")
        open_folder_btn.clicked.connect(self.open_install_folder)
        open_bridge_log_btn = QPushButton("打开消息日志")
        open_bridge_log_btn.clicked.connect(self.open_telegram_bridge_log)
        restart_bridge_btn = QPushButton("重启消息服务")
        restart_bridge_btn.clicked.connect(self.restart_telegram_bridge)
        actions.addWidget(register_btn)
        actions.addWidget(open_world_btn)
        actions.addWidget(open_folder_btn)
        actions.addWidget(open_bridge_log_btn)
        actions.addWidget(restart_bridge_btn)

        box_layout.addWidget(self.complete_headline)
        box_layout.addWidget(self.bridge_status_label)
        box_layout.addWidget(self.complete_status_output)
        box_layout.addLayout(actions)

        layout.addWidget(box)
        return page

    def closeEvent(self, event):
        try:
            self.auth_poll_timer.stop()
            self.payment_poll_timer.stop()
            self.stop_loopback_server()
        finally:
            super().closeEvent(event)


def parse_cli_args():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--telegram-bridge", action="store_true", help="Run Telegram bridge worker mode")
    parser.add_argument("--config", default="", help="Path to telegram bridge config json")
    parser.add_argument("--log", default="", help="Path to telegram bridge log")
    parser.add_argument("--health", default="", help="Path to telegram bridge health json")
    args, _ = parser.parse_known_args()
    return args


def main():
    app = QApplication([])
    app.setApplicationName("ELO Claw Installer")
    window = EOWInstaller()
    window.show()
    app.exec()


if __name__ == "__main__":
    args = parse_cli_args()
    if args.telegram_bridge:
        if not args.config:
            sys.exit(2)
        code = run_telegram_bridge_worker(
            config_path=args.config,
            log_path=args.log,
            health_path=args.health,
        )
        sys.exit(code)
    main()
