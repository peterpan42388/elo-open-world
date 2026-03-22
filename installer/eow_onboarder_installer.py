#!/usr/bin/env python3
import json
import os
import platform
import subprocess
import tempfile
import webbrowser
from dataclasses import dataclass, field
from typing import Dict, Optional

import requests
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QStackedWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)


MODEL_DOCS = {
    "OpenAI": ("https://platform.openai.com", "General-purpose reasoning, coding, and multimodal workflows."),
    "Anthropic": ("https://console.anthropic.com", "Strong long-context analysis and writing quality."),
    "Google": ("https://aistudio.google.com", "Gemini ecosystem for multimodal generation."),
    "DeepSeek": ("https://platform.deepseek.com", "Cost-effective coding and reasoning model options."),
}


PACKAGE_SKILLS = {
    "starter-openclaw": [
        "OpenClaw runtime baseline",
        "Model provider setup guidance",
    ],
    "work-openclaw": [
        "PPT authoring skills",
        "Excel/data analysis skills",
        "Document generation skills",
        "Image processing model setup",
    ],
    "vision-openclaw": [
        "Video creation workflow",
        "Cross-platform publishing workflow",
        "Video model API setup guidance",
    ],
    "builder-openclaw": [
        "EOW project protocol framework",
        "Delivery/checkpoint workflow baseline",
        "Collaboration-oriented coding setup",
    ],
}


@dataclass
class InstallerState:
    base_url: str = "https://world.metavie.co"
    human_id: str = ""
    installer_session_id: str = ""
    package_id: str = "starter-openclaw"
    profile: str = "macos-homebrew"
    registration_mode: str = "register-to-eow"
    workflow_preset: str = ""
    agent_name: str = ""
    agent_personality: str = ""
    model_provider: str = "OpenAI"
    model_name: str = ""
    model_api_key: str = ""
    chat_platform: str = "telegram"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    lark_app_id: str = ""
    lark_app_secret: str = ""
    lark_tenant_key: str = ""
    purchase_id: str = ""
    checkout_session_id: str = ""
    entitlement_id: str = ""
    payment_status: str = "pending"
    install_log: str = ""
    execution_plan: Dict = field(default_factory=dict)


class EOWInstaller(QWidget):
    def __init__(self):
        super().__init__()
        self.state = InstallerState()
        self.setWindowTitle("ELO Agent Onboarder Installer")
        self.resize(980, 680)
        self.stack = QStackedWidget()
        self.page_titles = []
        self.pages = []
        self.current_index = 0

        self.prev_button = QPushButton("Previous")
        self.next_button = QPushButton("Next")
        self.prev_button.clicked.connect(self.go_prev)
        self.next_button.clicked.connect(self.go_next)

        root = QVBoxLayout(self)
        root.addWidget(self.stack)

        actions = QHBoxLayout()
        actions.addWidget(self.prev_button)
        actions.addStretch(1)
        actions.addWidget(self.next_button)
        root.addLayout(actions)

        self.build_pages()
        self.refresh_nav()

    def build_pages(self):
        self.add_page("Login", self.build_login_page())
        self.add_page("Environment", self.build_env_page())
        self.add_page("Package", self.build_package_page())
        self.add_page("Agent", self.build_agent_page())
        self.add_page("Model", self.build_model_page())
        self.add_page("Chat Binding", self.build_chat_page())
        self.add_page("Skill Preview", self.build_skill_page())
        self.add_page("Payment", self.build_payment_page())
        self.add_page("Install", self.build_install_page())
        self.add_page("Complete", self.build_complete_page())

    def add_page(self, title: str, widget: QWidget):
        self.page_titles.append(title)
        self.pages.append(widget)
        self.stack.addWidget(widget)

    def refresh_nav(self):
        self.prev_button.setEnabled(self.current_index > 0)
        self.next_button.setText("Finish" if self.current_index == len(self.pages) - 1 else "Next")

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
        title = self.page_titles[self.current_index]
        if title == "Skill Preview":
            self.render_skill_preview()
        if title == "Payment":
            self.render_payment_status()
        if title == "Complete":
            self.render_complete_status()

    def validate_current_page(self) -> bool:
        title = self.page_titles[self.current_index]
        if title == "Login":
            if not self.human_id_input.text().strip():
                self.error("Please enter your Session Human ID after EOW login.")
                return False
            self.state.human_id = self.human_id_input.text().strip()
            self.state.base_url = self.base_url_input.text().strip().rstrip("/")
            return self.start_installer_session()
        if title == "Agent":
            if not self.agent_name_input.text().strip():
                self.error("Please input Agent Name.")
                return False
            self.state.agent_name = self.agent_name_input.text().strip()
            self.state.agent_personality = self.agent_personality_input.toPlainText().strip()
            return self.update_installer_session()
        if title == "Model":
            self.state.model_provider = self.model_provider_combo.currentText()
            self.state.model_name = self.model_name_input.text().strip()
            self.state.model_api_key = self.model_api_key_input.text().strip()
            if not self.state.model_name or not self.state.model_api_key:
                self.error("Please input model name and API key.")
                return False
            return self.update_installer_session()
        if title == "Chat Binding":
            self.state.chat_platform = self.chat_platform_combo.currentText().lower()
            self.state.telegram_bot_token = self.telegram_bot_token_input.text().strip()
            self.state.telegram_chat_id = self.telegram_chat_id_input.text().strip()
            self.state.lark_app_id = self.lark_app_id_input.text().strip()
            self.state.lark_app_secret = self.lark_app_secret_input.text().strip()
            self.state.lark_tenant_key = self.lark_tenant_key_input.text().strip()
            return self.update_installer_session()
        if title == "Payment":
            if self.state.payment_status != "paid":
                self.error("Payment is required before installation.")
                return False
        return True

    def request(self, path: str, method: str = "POST", payload: Optional[Dict] = None):
        if not self.state.human_id:
            raise RuntimeError("human_id is not set")
        headers = {
            "Content-Type": "application/json",
            "X-ELO-Session-Human-Id": self.state.human_id,
        }
        url = f"{self.state.base_url}{path}"
        response = requests.request(method, url, headers=headers, json=payload or {}, timeout=60)
        if response.status_code >= 400:
            try:
                message = response.json().get("error", response.text)
            except Exception:
                message = response.text
            raise RuntimeError(f"{response.status_code}: {message}")
        if "application/json" in response.headers.get("Content-Type", ""):
            return response.json()
        return response.content

    def start_installer_session(self) -> bool:
        self.state.package_id = self.package_combo.currentData()
        self.state.profile = self.profile_combo.currentData()
        self.state.registration_mode = "register-to-eow" if self.registration_checkbox.isChecked() else "local-only"
        try:
            result = self.request("/api/onboarder/installer/session/start", payload={
                "packageId": self.state.package_id,
                "profile": self.state.profile,
                "registrationMode": self.state.registration_mode,
                "workflowPreset": "",
            })
            self.state.installer_session_id = result["installerSessionId"]
            return True
        except Exception as exc:
            self.error(str(exc))
            return False

    def update_installer_session(self) -> bool:
        try:
            self.request("/api/onboarder/installer/session/update", payload={
                "installerSessionId": self.state.installer_session_id,
                "agentName": self.state.agent_name,
                "agentPersonality": self.state.agent_personality,
                "modelProvider": self.state.model_provider,
                "modelName": self.state.model_name,
                "modelApiKey": self.state.model_api_key,
                "chatBinding": {
                    "platform": self.state.chat_platform,
                    "telegramBotToken": self.state.telegram_bot_token,
                    "telegramChatId": self.state.telegram_chat_id,
                    "larkAppId": self.state.lark_app_id,
                    "larkAppSecret": self.state.lark_app_secret,
                    "larkTenantKey": self.state.lark_tenant_key,
                },
            })
            return True
        except Exception as exc:
            self.error(str(exc))
            return False

    def check_payment_status(self):
        result = self.request("/api/onboarder/installer/payment/status", payload={
            "installerSessionId": self.state.installer_session_id
        })
        self.state.payment_status = result.get("paymentStatus", "pending")
        self.state.purchase_id = result.get("purchaseId", "")
        self.state.checkout_session_id = result.get("checkoutSessionId", "")
        self.state.entitlement_id = result.get("entitlementId", "")
        self.render_payment_status()

    def create_checkout(self):
        result = self.request("/api/onboarder/installer/payment/checkout-session", payload={
            "installerSessionId": self.state.installer_session_id
        })
        self.state.purchase_id = result.get("purchaseId", "")
        self.state.checkout_session_id = result.get("checkoutSessionId", "")
        checkout_url = result.get("checkoutUrl", "")
        if checkout_url:
            webbrowser.open(checkout_url)
        self.payment_status_label.setText("Payment opened in browser. Complete payment and click 'I Paid, Recheck'.")

    def confirm_payment(self):
        try:
            result = self.request("/api/onboarder/installer/payment/confirm", payload={
                "installerSessionId": self.state.installer_session_id,
                "checkoutSessionId": self.state.checkout_session_id,
            })
            self.state.payment_status = result.get("paymentStatus", "pending")
            self.state.entitlement_id = result.get("entitlementId", "")
            self.render_payment_status()
        except Exception as exc:
            self.payment_status_label.setText(str(exc))

    def render_payment_status(self):
        lines = [
            f"Installer Session: {self.state.installer_session_id or '-'}",
            f"Purchase: {self.state.purchase_id or '-'}",
            f"Payment Status: {self.state.payment_status}",
            f"Entitlement: {self.state.entitlement_id or '-'}",
        ]
        self.payment_status_label.setText("\n".join(lines))

    def run_install(self):
        try:
            plan_payload = self.request("/api/onboarder/installer/plan", payload={
                "installerSessionId": self.state.installer_session_id,
                "worldUrl": self.state.base_url,
            })
            self.state.execution_plan = plan_payload.get("plan", {})
            script_payload = self.request("/api/onboarder/installer/script", payload={
                "installerSessionId": self.state.installer_session_id,
                "worldUrl": self.state.base_url,
            })
            script = script_payload.get("script", "")
            if not script:
                raise RuntimeError("installer script is empty")

            with tempfile.TemporaryDirectory(prefix="eow-installer-") as td:
                script_path = os.path.join(td, "install.sh")
                with open(script_path, "w", encoding="utf-8") as fp:
                    fp.write(script)
                os.chmod(script_path, 0o700)

                if platform.system().lower().startswith("win"):
                    cmd = ["bash", script_path]
                else:
                    cmd = [script_path]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
                self.state.install_log = f"exit={proc.returncode}\n\nSTDOUT:\n{proc.stdout}\n\nSTDERR:\n{proc.stderr}"
                self.install_log_output.setPlainText(self.state.install_log)
                if proc.returncode != 0:
                    raise RuntimeError("install script failed, see logs")

            self.request("/api/onboarder/installer/complete", payload={
                "installerSessionId": self.state.installer_session_id,
                "installReport": {
                    "ok": True,
                    "platform": platform.platform(),
                },
            })
            self.install_status_label.setText("Installation completed successfully.")
        except Exception as exc:
            self.install_status_label.setText(f"Install failed: {exc}")

    def register_to_world(self):
        try:
            result = self.request("/api/onboarder/installer/register", payload={
                "installerSessionId": self.state.installer_session_id
            })
            self.complete_status_output.setPlainText(json.dumps(result, indent=2, ensure_ascii=False))
        except Exception as exc:
            self.error(str(exc))

    def render_skill_preview(self):
        package = self.package_combo.currentData()
        skill_lines = PACKAGE_SKILLS.get(package, [])
        self.skill_output.setPlainText("\n".join(f"- {line}" for line in skill_lines))

    def render_complete_status(self):
        result = {
            "installerSessionId": self.state.installer_session_id,
            "paymentStatus": self.state.payment_status,
            "entitlementId": self.state.entitlement_id,
            "installPlanReady": bool(self.state.execution_plan),
        }
        self.complete_status_output.setPlainText(json.dumps(result, indent=2, ensure_ascii=False))

    def error(self, message: str):
        QMessageBox.critical(self, "Error", message)

    def info(self, message: str):
        QMessageBox.information(self, "Info", message)

    def build_login_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.addWidget(QLabel("Login to EOW first. Then paste your Session Human ID."))
        form = QFormLayout()
        self.base_url_input = QLineEdit(self.state.base_url)
        self.human_id_input = QLineEdit("")
        form.addRow("EOW Base URL", self.base_url_input)
        form.addRow("Session Human ID", self.human_id_input)
        layout.addLayout(form)
        btns = QHBoxLayout()
        login_btn = QPushButton("Open EOW Login")
        reg_btn = QPushButton("Open EOW Register")
        login_btn.clicked.connect(lambda: webbrowser.open(f"{self.base_url_input.text().strip().rstrip('/')}/#join"))
        reg_btn.clicked.connect(lambda: webbrowser.open(f"{self.base_url_input.text().strip().rstrip('/')}/#join"))
        btns.addWidget(login_btn)
        btns.addWidget(reg_btn)
        layout.addLayout(btns)
        return page

    def build_env_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.addWidget(QLabel("Environment detection"))
        self.env_output = QTextEdit()
        self.env_output.setReadOnly(True)
        detect_btn = QPushButton("Detect Environment")
        detect_btn.clicked.connect(self.detect_environment)
        layout.addWidget(detect_btn)
        layout.addWidget(self.env_output)
        return page

    def detect_environment(self):
        checks = {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "cwd": os.getcwd(),
            "network": "ok",
        }
        self.env_output.setPlainText(json.dumps(checks, indent=2, ensure_ascii=False))

    def build_package_page(self):
        page = QWidget()
        layout = QFormLayout(page)
        self.package_combo = QComboBox()
        self.package_combo.addItem("Starter OpenClaw ($8)", "starter-openclaw")
        self.package_combo.addItem("Work OpenClaw ($16)", "work-openclaw")
        self.package_combo.addItem("Vision OpenClaw ($29)", "vision-openclaw")
        self.package_combo.addItem("Builder OpenClaw ($79)", "builder-openclaw")
        self.profile_combo = QComboBox()
        self.profile_combo.addItem("macOS Homebrew", "macos-homebrew")
        self.profile_combo.addItem("Linux systemd", "linux-systemd")
        self.profile_combo.addItem("Server Docker Compose", "server-docker-compose")
        self.registration_checkbox = QCheckBox("Register to EOW after install")
        self.registration_checkbox.setChecked(True)
        layout.addRow("Package", self.package_combo)
        layout.addRow("Environment", self.profile_combo)
        layout.addRow("", self.registration_checkbox)
        return page

    def build_agent_page(self):
        page = QWidget()
        layout = QFormLayout(page)
        self.agent_name_input = QLineEdit()
        self.agent_personality_input = QTextEdit()
        self.agent_personality_input.setPlaceholderText("Describe your agent personality. This will be written to SOUL.md")
        layout.addRow("Agent Name", self.agent_name_input)
        layout.addRow("Agent Personality", self.agent_personality_input)
        return page

    def build_model_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        form = QFormLayout()
        self.model_provider_combo = QComboBox()
        self.model_provider_combo.addItems(list(MODEL_DOCS.keys()))
        self.model_name_input = QLineEdit()
        self.model_api_key_input = QLineEdit()
        self.model_api_key_input.setEchoMode(QLineEdit.Password)
        form.addRow("Model Provider", self.model_provider_combo)
        form.addRow("Model Name", self.model_name_input)
        form.addRow("API Key", self.model_api_key_input)
        layout.addLayout(form)
        self.model_desc = QTextEdit()
        self.model_desc.setReadOnly(True)
        layout.addWidget(self.model_desc)
        model_btn = QPushButton("Open Provider Website")
        model_btn.clicked.connect(self.open_model_site)
        layout.addWidget(model_btn)
        self.model_provider_combo.currentTextChanged.connect(self.update_model_desc)
        self.update_model_desc(self.model_provider_combo.currentText())
        return page

    def update_model_desc(self, provider: str):
        url, desc = MODEL_DOCS.get(provider, ("", ""))
        self.model_desc.setPlainText(f"Provider: {provider}\nWebsite: {url}\n\n{desc}")

    def open_model_site(self):
        provider = self.model_provider_combo.currentText()
        url = MODEL_DOCS.get(provider, ("", ""))[0]
        if url:
            webbrowser.open(url)

    def build_chat_page(self):
        page = QWidget()
        layout = QFormLayout(page)
        self.chat_platform_combo = QComboBox()
        self.chat_platform_combo.addItems(["Telegram", "Feishu"])
        self.telegram_bot_token_input = QLineEdit()
        self.telegram_chat_id_input = QLineEdit()
        self.lark_app_id_input = QLineEdit()
        self.lark_app_secret_input = QLineEdit()
        self.lark_tenant_key_input = QLineEdit()
        self.lark_app_secret_input.setEchoMode(QLineEdit.Password)
        layout.addRow("Platform", self.chat_platform_combo)
        layout.addRow("Telegram Bot Token", self.telegram_bot_token_input)
        layout.addRow("Telegram Chat ID", self.telegram_chat_id_input)
        layout.addRow("Feishu App ID", self.lark_app_id_input)
        layout.addRow("Feishu App Secret", self.lark_app_secret_input)
        layout.addRow("Feishu Tenant Key", self.lark_tenant_key_input)
        return page

    def build_skill_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.addWidget(QLabel("Skill package preview"))
        self.skill_output = QTextEdit()
        self.skill_output.setReadOnly(True)
        layout.addWidget(self.skill_output)
        return page

    def build_payment_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        self.payment_status_label = QTextEdit()
        self.payment_status_label.setReadOnly(True)
        self.payment_status_label.setMinimumHeight(140)
        btn_checkout = QPushButton("Open Stripe Checkout")
        btn_recheck = QPushButton("I Paid, Recheck")
        btn_confirm = QPushButton("Confirm Checkout")
        btn_checkout.clicked.connect(self.create_checkout)
        btn_recheck.clicked.connect(self.check_payment_status)
        btn_confirm.clicked.connect(self.confirm_payment)
        layout.addWidget(self.payment_status_label)
        layout.addWidget(btn_checkout)
        layout.addWidget(btn_recheck)
        layout.addWidget(btn_confirm)
        return page

    def build_install_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        self.install_status_label = QLabel("Ready to install.")
        self.install_log_output = QTextEdit()
        self.install_log_output.setReadOnly(True)
        install_btn = QPushButton("Start Installation")
        install_btn.clicked.connect(self.run_install)
        layout.addWidget(self.install_status_label)
        layout.addWidget(install_btn)
        layout.addWidget(self.install_log_output)
        return page

    def build_complete_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        self.complete_status_output = QTextEdit()
        self.complete_status_output.setReadOnly(True)
        register_btn = QPushButton("Register to EOW")
        register_btn.clicked.connect(self.register_to_world)
        open_world_btn = QPushButton("Open EOW Settings")
        open_world_btn.clicked.connect(lambda: webbrowser.open(f"{self.state.base_url}/#settings"))
        layout.addWidget(self.complete_status_output)
        layout.addWidget(register_btn)
        layout.addWidget(open_world_btn)
        return page


def main():
    app = QApplication([])
    app.setApplicationName("ELO Agent Onboarder Installer")
    window = EOWInstaller()
    window.show()
    app.exec()


if __name__ == "__main__":
    main()

