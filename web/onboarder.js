const FALLBACK_PACKAGES = [
  {
    packageId: "starter-openclaw",
    displayName: "Starter OpenClaw",
    description: "Basic installation and model setup guidance.",
    displayPriceUsd: 8,
    includedCapabilities: ["runtime-contract", "diagnostics", "model-guides"]
  },
  {
    packageId: "work-openclaw",
    displayName: "Work OpenClaw",
    description: "Office skills with image processing guidance.",
    displayPriceUsd: 16,
    includedCapabilities: ["office-skills", "image-model-guides", "dashboard-core"]
  },
  {
    packageId: "vision-openclaw",
    displayName: "Vision OpenClaw",
    description: "Video workflows with publishing automation.",
    displayPriceUsd: 29,
    includedCapabilities: ["video-workflows", "publish-workflows", "video-model-guides"]
  },
  {
    packageId: "builder-openclaw",
    displayName: "Builder OpenClaw",
    description: "Engineering collaboration and protocol framework.",
    displayPriceUsd: 79,
    includedCapabilities: ["project-protocol-framework", "collaboration-controls", "workflow-manifest"]
  }
];

const SUPPORTED_LANGS = ["en", "zh", "es", "ja"];
const STORAGE_LANG_KEY = "elo.onboarder.lang";

const I18N = {
  en: {
    pageTitle: "ELO Claw Installer",
    navHome: "Home",
    navPlans: "Plans",
    navFaq: "FAQ",
    navSignIn: "Sign In",
    langLabel: "Language",
    heroBadge: "ELO Claw Installer",
    heroTitlePre: "Build Your",
    heroTitleAccent: "OpenClaw Agent",
    heroSubLine: "No command line required, just guided setup.",
    heroSubStrong: "Let your AI teammate work for you.",
    downloadMac: "Download for macOS",
    downloadWin: "Download for Windows",
    heroMeta: "4-language guided installer · optional EOW integration",
    featuresTitle: "Why ELO Claw Installer",
    featuresSub: "Three advantages for non-technical users",
    feature1Title: "Zero CLI Barrier",
    feature1Body: "A visual step-by-step flow from login to installation.",
    feature2Title: "Local-Only Key Safety",
    feature2Body: "Your API keys stay on your device and are never uploaded.",
    feature3Title: "Cost Visibility",
    feature3Body: "Track usage and estimated cost through local dashboard tools.",
    stepsTitle: "Start in 3 Steps",
    stepsSub: "Download, configure, and launch quickly",
    step1Title: "Download Installer",
    step1Body: "Choose macOS or Windows and open the app.",
    step2Title: "Authorize + Select Plan",
    step2Body: "Login to EOW, then choose package and model settings.",
    step3Title: "Pay and Auto Install",
    step3Body: "Complete one-time payment in installer and finish setup.",
    startNow: "Start Now",
    pricingTitle: "Choose Your Package",
    pricingSub: "From starter to builder, pick what fits your goals",
    planChoose: "Choose Plan",
    securityTitle: "Privacy and Security Promise",
    securitySub: "Your keys remain local, your setup stays in your control",
    securityCard1Title: "API Key Local-Only",
    securityCard2Title: "No Server Storage",
    securityCard3Title: "Installer-First Guidance",
    securityCard4Title: "Stripe One-Time Payment",
    securityCard4Body: "Payment is completed safely in installer checkout.",
    faqTitle: "Frequently Asked Questions",
    faqSub: "Answers to the most common onboarding questions",
    faqQ1: "Can I use this without command line skills?",
    faqA1: "Yes. The installer is fully guided and beginner-friendly.",
    faqQ2: "Which operating systems are supported?",
    faqA2: "Currently macOS and Windows are supported.",
    faqQ3: "Will my API key be uploaded?",
    faqA3: "No. API keys are stored and written locally only.",
    faqQ4: "What should I do after installation?",
    faqA4: "Open your local dashboard to configure advanced keys and monitor cost.",
    footerTitle: "Ready to Build Your OpenClaw?",
    footerSub: "Download ELO Claw Installer and launch in minutes",
    footerDownload: "Download Installer",
    footerPlans: "View Plans",
    bannerSuccess: "Checkout success detected. Confirming order now, then continue in installer.",
    bannerCancel: "Checkout was cancelled. You can still download installer and continue setup.",
    levelStarter: "Starter",
    levelWork: "Work",
    levelVision: "Vision",
    levelBuilder: "Builder",
    levelDefault: "Standard",
    trustFallback1: "API keys are local-only and not uploaded to EOW.",
    trustFallback2: "Installer uses guided UI flow for non-technical users.",
    trustFallback3: "Payment is one-time via Stripe and completed in installer."
  },
  zh: {
    pageTitle: "ELO 龙虾安装器",
    navHome: "首页",
    navPlans: "套餐",
    navFaq: "常见问题",
    navSignIn: "登录",
    langLabel: "语言",
    heroBadge: "ELO 龙虾安装器",
    heroTitlePre: "一键安装你的",
    heroTitleAccent: "OpenClaw Agent",
    heroSubLine: "无需命令行，跟随图形化引导即可完成安装。",
    heroSubStrong: "让你的 AI 伙伴开始为你工作。",
    downloadMac: "下载 macOS 版本",
    downloadWin: "下载 Windows 版本",
    heroMeta: "支持 4 种语言安装流程 · 安装后可选接入 EOW",
    featuresTitle: "为什么选择 ELO 龙虾安装器",
    featuresSub: "面向普通用户的三大优势",
    feature1Title: "零命令行门槛",
    feature1Body: "从登录到安装全程可视化步骤引导。",
    feature2Title: "密钥本地安全",
    feature2Body: "你的 API Key 只保存在本机，不会上传。",
    feature3Title: "成本可见",
    feature3Body: "通过本地仪表盘查看调用次数与费用估算。",
    stepsTitle: "三步启动你的 Agent",
    stepsSub: "下载、配置、上线，一次完成",
    step1Title: "下载安装器",
    step1Body: "选择系统版本后双击打开即可开始。",
    step2Title: "授权登录 + 选择套餐",
    step2Body: "登录 EOW 后选择套餐与模型配置。",
    step3Title: "支付并自动安装",
    step3Body: "在安装器内完成一次性付款并自动完成配置。",
    startNow: "立即开始",
    pricingTitle: "按需选择套餐",
    pricingSub: "从入门到专业，总有一款适合你",
    planChoose: "选择套餐",
    securityTitle: "隐私与安全承诺",
    securitySub: "密钥留在本地，安装过程由你掌控",
    securityCard1Title: "API Key 仅本地写入",
    securityCard2Title: "服务端不存储密钥",
    securityCard3Title: "安装器引导友好",
    securityCard4Title: "Stripe 一次性支付",
    securityCard4Body: "支付过程在安装器内完成，安全可靠。",
    faqTitle: "常见问题",
    faqSub: "我们整理了最常见的安装与使用问题",
    faqQ1: "不会命令行也能使用吗？",
    faqA1: "可以。安装器面向普通用户，按提示点击下一步即可。",
    faqQ2: "支持哪些系统？",
    faqA2: "当前支持 macOS 和 Windows。",
    faqQ3: "API Key 会上传吗？",
    faqA3: "不会。API Key 仅本地写入，不会进入服务端。",
    faqQ4: "安装完成后做什么？",
    faqA4: "打开本地 Dashboard，继续配置高级能力与查看成本。",
    footerTitle: "准备好启动你的 OpenClaw 了吗？",
    footerSub: "下载 ELO 龙虾安装器，几分钟完成部署",
    footerDownload: "下载安装器",
    footerPlans: "查看套餐",
    bannerSuccess: "已检测到支付成功，正在确认订单。请继续在安装器内完成安装。",
    bannerCancel: "你已取消支付。仍可先下载安装器并继续配置流程。",
    levelStarter: "基础",
    levelWork: "工作",
    levelVision: "视觉",
    levelBuilder: "编程",
    levelDefault: "标准",
    trustFallback1: "API Key 仅本地写入，不会上传到 EOW。",
    trustFallback2: "安装器为普通用户提供可视化引导流程。",
    trustFallback3: "支付为 Stripe 一次性付款，并在安装器内完成。"
  },
  es: {
    pageTitle: "ELO Claw Installer",
    navHome: "Inicio",
    navPlans: "Planes",
    navFaq: "FAQ",
    navSignIn: "Iniciar sesión",
    langLabel: "Idioma",
    heroBadge: "ELO Claw Installer",
    heroTitlePre: "Instala tu",
    heroTitleAccent: "OpenClaw Agent",
    heroSubLine: "Sin línea de comandos: solo una guía visual paso a paso.",
    heroSubStrong: "Haz que tu compañero de IA trabaje contigo.",
    downloadMac: "Descargar para macOS",
    downloadWin: "Descargar para Windows",
    heroMeta: "Instalador guiado en 4 idiomas · integración opcional con EOW",
    featuresTitle: "Por qué ELO Claw Installer",
    featuresSub: "Tres ventajas para usuarios no técnicos",
    feature1Title: "Sin barrera de CLI",
    feature1Body: "Flujo visual completo desde login hasta instalación.",
    feature2Title: "Keys solo en local",
    feature2Body: "Tus API keys permanecen en tu dispositivo y no se suben.",
    feature3Title: "Visibilidad de costo",
    feature3Body: "Monitorea uso y costo estimado desde el dashboard local.",
    stepsTitle: "Comienza en 3 pasos",
    stepsSub: "Descarga, configura y lanza rápidamente",
    step1Title: "Descarga el instalador",
    step1Body: "Elige macOS o Windows y abre la app.",
    step2Title: "Autoriza + Elige plan",
    step2Body: "Inicia sesión en EOW y configura plan y modelo.",
    step3Title: "Paga e instala automáticamente",
    step3Body: "Pago único dentro del instalador y configuración final automática.",
    startNow: "Comenzar ahora",
    pricingTitle: "Elige tu paquete",
    pricingSub: "De inicio a profesional, elige el que mejor te encaje",
    planChoose: "Elegir plan",
    securityTitle: "Compromiso de privacidad y seguridad",
    securitySub: "Tus keys son locales y tu instalación queda bajo control",
    securityCard1Title: "API Key solo local",
    securityCard2Title: "Sin almacenamiento en servidor",
    securityCard3Title: "Guía amigable en instalador",
    securityCard4Title: "Pago único con Stripe",
    securityCard4Body: "El pago se completa de forma segura dentro del instalador.",
    faqTitle: "Preguntas frecuentes",
    faqSub: "Respuestas a las dudas más comunes",
    faqQ1: "¿Puedo usarlo sin saber línea de comandos?",
    faqA1: "Sí. El instalador está guiado y pensado para principiantes.",
    faqQ2: "¿Qué sistemas operativos son compatibles?",
    faqA2: "Actualmente macOS y Windows.",
    faqQ3: "¿Se sube mi API key?",
    faqA3: "No. La API key se guarda y escribe solo en local.",
    faqQ4: "¿Qué hago después de instalar?",
    faqA4: "Abre tu dashboard local para configurar keys avanzadas y costos.",
    footerTitle: "¿Listo para crear tu OpenClaw?",
    footerSub: "Descarga ELO Claw Installer y lánzalo en minutos",
    footerDownload: "Descargar instalador",
    footerPlans: "Ver planes",
    bannerSuccess: "Pago detectado con éxito. Confirmando orden: continúa en el instalador.",
    bannerCancel: "Pago cancelado. Puedes descargar el instalador y continuar el flujo.",
    levelStarter: "Inicial",
    levelWork: "Trabajo",
    levelVision: "Visual",
    levelBuilder: "Builder",
    levelDefault: "Estándar",
    trustFallback1: "Las API keys se guardan solo en local y no se suben a EOW.",
    trustFallback2: "El instalador ofrece un flujo guiado para usuarios no técnicos.",
    trustFallback3: "El pago es único con Stripe y se completa dentro del instalador."
  },
  ja: {
    pageTitle: "ELO Claw Installer",
    navHome: "ホーム",
    navPlans: "プラン",
    navFaq: "FAQ",
    navSignIn: "サインイン",
    langLabel: "言語",
    heroBadge: "ELO Claw Installer",
    heroTitlePre: "あなたの",
    heroTitleAccent: "OpenClaw Agent を導入",
    heroSubLine: "コマンドライン不要。ガイド UI で簡単セットアップ。",
    heroSubStrong: "あなたの AI パートナーを今すぐ稼働させましょう。",
    downloadMac: "macOS 版をダウンロード",
    downloadWin: "Windows 版をダウンロード",
    heroMeta: "4 言語対応インストーラー · EOW 連携は任意",
    featuresTitle: "ELO Claw Installer を選ぶ理由",
    featuresSub: "非技術ユーザー向けの 3 つの強み",
    feature1Title: "CLI 不要",
    feature1Body: "ログインからインストールまで可視化された手順で進行。",
    feature2Title: "API Key はローカル保存",
    feature2Body: "API Key は端末内のみで扱い、アップロードしません。",
    feature3Title: "コスト可視化",
    feature3Body: "ローカルダッシュボードで使用量と費用を確認できます。",
    stepsTitle: "3 ステップで開始",
    stepsSub: "ダウンロード、設定、起動までを短時間で",
    step1Title: "インストーラーをダウンロード",
    step1Body: "macOS または Windows を選んでアプリを開きます。",
    step2Title: "認証 + プラン選択",
    step2Body: "EOW にログインしてプランとモデルを設定します。",
    step3Title: "支払い後に自動インストール",
    step3Body: "インストーラー内で一回払いし、設定を自動完了します。",
    startNow: "今すぐ開始",
    pricingTitle: "プランを選択",
    pricingSub: "入門から上級まで、目的に合わせて選べます",
    planChoose: "プランを選ぶ",
    securityTitle: "プライバシーと安全性の約束",
    securitySub: "キーはローカル保持、セットアップはあなたの管理下",
    securityCard1Title: "API Key はローカル限定",
    securityCard2Title: "サーバー保存なし",
    securityCard3Title: "インストーラーで簡単ガイド",
    securityCard4Title: "Stripe 一回払い",
    securityCard4Body: "支払いはインストーラー内で安全に完了します。",
    faqTitle: "よくある質問",
    faqSub: "オンボーディングでよくある疑問に回答します",
    faqQ1: "コマンドラインが分からなくても使えますか？",
    faqA1: "はい。インストーラーは初心者向けのガイド形式です。",
    faqQ2: "対応 OS は？",
    faqA2: "現在は macOS と Windows に対応しています。",
    faqQ3: "API Key はアップロードされますか？",
    faqA3: "いいえ。API Key はローカルのみで保存・反映されます。",
    faqQ4: "インストール後は何をすればいいですか？",
    faqA4: "ローカル Dashboard を開いて高度な Key とコストを設定してください。",
    footerTitle: "OpenClaw を始める準備はできましたか？",
    footerSub: "ELO Claw Installer をダウンロードして数分で開始",
    footerDownload: "インストーラーをダウンロード",
    footerPlans: "プランを見る",
    bannerSuccess: "支払い成功を検出しました。注文確認後、インストーラーで続行してください。",
    bannerCancel: "支払いはキャンセルされました。先にインストーラーをダウンロードして続行できます。",
    levelStarter: "スターター",
    levelWork: "ワーク",
    levelVision: "ビジョン",
    levelBuilder: "ビルダー",
    levelDefault: "標準",
    trustFallback1: "API Key はローカル保存のみで、EOW へ送信されません。",
    trustFallback2: "インストーラーは非技術ユーザー向けのガイド UI です。",
    trustFallback3: "支払いは Stripe の一回払いでインストーラー内で完了します。"
  }
};

const PACKAGE_LEVEL = {
  "starter-openclaw": "levelStarter",
  "work-openclaw": "levelWork",
  "vision-openclaw": "levelVision",
  "builder-openclaw": "levelBuilder"
};

const LANG_HTML = {
  en: "en",
  zh: "zh-CN",
  es: "es",
  ja: "ja"
};

let currentLanguage = "en";
let currentOffer = null;

function normalizeLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("zh")) return "zh";
  if (raw.startsWith("es")) return "es";
  if (raw.startsWith("ja")) return "ja";
  if (raw.startsWith("en")) return "en";
  return "";
}

function resolveInitialLanguage() {
  const url = new URL(window.location.href);
  const queryLang = normalizeLanguage(url.searchParams.get("lang") || "");
  if (SUPPORTED_LANGS.includes(queryLang)) return queryLang;

  const saved = normalizeLanguage(window.localStorage.getItem(STORAGE_LANG_KEY) || "");
  if (SUPPORTED_LANGS.includes(saved)) return saved;

  const browserList = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en"];
  for (const item of browserList) {
    const normalized = normalizeLanguage(item || "");
    if (SUPPORTED_LANGS.includes(normalized)) return normalized;
  }
  return "en";
}

function t(key) {
  return I18N[currentLanguage]?.[key] || I18N.en[key] || key;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = value;
}

function applyStaticText() {
  document.title = t("pageTitle");
  document.documentElement.lang = LANG_HTML[currentLanguage] || "en";

  const langSelect = document.getElementById("lang-select");
  if (langSelect && langSelect.value !== currentLanguage) {
    langSelect.value = currentLanguage;
  }

  setText("nav-home", t("navHome"));
  setText("nav-plans", t("navPlans"));
  setText("nav-faq", t("navFaq"));
  setText("nav-signin", t("navSignIn"));
  setText("lang-label", t("langLabel"));

  setText("hero-badge", t("heroBadge"));
  setText("hero-title-pre", t("heroTitlePre"));
  setText("hero-title-accent", t("heroTitleAccent"));
  setText("hero-sub-line", t("heroSubLine"));
  setText("hero-sub-strong", t("heroSubStrong"));
  setText("download-macos", t("downloadMac"));
  setText("download-windows", t("downloadWin"));
  setText("hero-meta", t("heroMeta"));

  setText("features-title", t("featuresTitle"));
  setText("features-sub", t("featuresSub"));
  setText("feature1-title", t("feature1Title"));
  setText("feature1-body", t("feature1Body"));
  setText("feature2-title", t("feature2Title"));
  setText("feature2-body", t("feature2Body"));
  setText("feature3-title", t("feature3Title"));
  setText("feature3-body", t("feature3Body"));

  setText("steps-title", t("stepsTitle"));
  setText("steps-sub", t("stepsSub"));
  setText("step1-title", t("step1Title"));
  setText("step1-body", t("step1Body"));
  setText("step2-title", t("step2Title"));
  setText("step2-body", t("step2Body"));
  setText("step3-title", t("step3Title"));
  setText("step3-body", t("step3Body"));
  setText("start-now", t("startNow"));

  setText("pricing-title", t("pricingTitle"));
  setText("pricing-sub", t("pricingSub"));

  setText("security-title", t("securityTitle"));
  setText("security-sub", t("securitySub"));
  setText("security-card1-title", t("securityCard1Title"));
  setText("security-card2-title", t("securityCard2Title"));
  setText("security-card3-title", t("securityCard3Title"));
  setText("security-card4-title", t("securityCard4Title"));
  setText("security-card4-body", t("securityCard4Body"));

  setText("faq-title", t("faqTitle"));
  setText("faq-sub", t("faqSub"));
  setText("faq-q1", t("faqQ1"));
  setText("faq-a1", t("faqA1"));
  setText("faq-q2", t("faqQ2"));
  setText("faq-a2", t("faqA2"));
  setText("faq-q3", t("faqQ3"));
  setText("faq-a3", t("faqA3"));
  setText("faq-q4", t("faqQ4"));
  setText("faq-a4", t("faqA4"));

  setText("footer-title", t("footerTitle"));
  setText("footer-sub", t("footerSub"));
  setText("footer-download", t("footerDownload"));
  setText("footer-view-plans", t("footerPlans"));
}

function syncLanguageUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("lang") !== currentLanguage) {
    url.searchParams.set("lang", currentLanguage);
    window.history.replaceState({}, "", url);
  }
}

function setLanguage(lang, { persist = true, syncUrl = true, rerender = true } = {}) {
  const normalized = normalizeLanguage(lang) || "en";
  currentLanguage = SUPPORTED_LANGS.includes(normalized) ? normalized : "en";

  if (persist) {
    window.localStorage.setItem(STORAGE_LANG_KEY, currentLanguage);
  }
  if (syncUrl) {
    syncLanguageUrl();
  }

  applyStaticText();
  if (rerender) {
    renderCheckoutBanner();
    renderSecurityNotes(currentOffer);
    renderPackages(currentOffer);
  }
}

function startInstallerDownload(targetOs = "macos") {
  const safeOs = String(targetOs || "macos").toLowerCase() === "windows" ? "windows" : "macos";
  const link = document.createElement("a");
  link.href = `/api/onboarder/installer/download?os=${encodeURIComponent(safeOs)}`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function scrollToDownloadAnchor() {
  const anchor = document.getElementById("download-anchor");
  if (!anchor) return;
  anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelectorAll(".is-download").forEach((node) => {
    node.classList.add("download-focus");
    window.setTimeout(() => node.classList.remove("download-focus"), 900);
  });
}

function packageBillingStatus(offer, packageId) {
  const pkgState = offer?.billingReadiness?.packages?.[packageId];
  if (!pkgState) return { configured: false, keyUsed: "" };
  return pkgState;
}

function resolvePackageFeatures(offer, packageId, fallback = []) {
  const i18n = offer?.packageContentsI18n || {};
  const local = i18n?.[currentLanguage]?.[packageId];
  if (Array.isArray(local) && local.length) return local;
  const en = i18n?.en?.[packageId];
  if (Array.isArray(en) && en.length) return en;
  return Array.isArray(fallback) ? fallback : [];
}

function levelLabel(packageId) {
  const key = PACKAGE_LEVEL[packageId] || "levelDefault";
  return t(key);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPackages(offer) {
  const root = document.getElementById("onb-package-grid");
  if (!root) return;
  const packages = Array.isArray(offer?.packages) && offer.packages.length ? offer.packages : FALLBACK_PACKAGES;
  root.innerHTML = packages.map((pkg) => {
    const bill = packageBillingStatus(offer, pkg.packageId);
    const enabled = Boolean(bill.configured);
    const features = resolvePackageFeatures(offer, pkg.packageId, pkg.includedCapabilities || []).slice(0, 5);

    return `
      <article class="mk-pricing-card ${enabled ? "" : "is-disabled"}">
        <div class="mk-pricing-head">
          <h3>${escapeHtml(pkg.displayName)}</h3>
          <span class="level">${escapeHtml(levelLabel(pkg.packageId))}</span>
        </div>
        <div class="mk-price-col">
          <div class="mk-price">$${escapeHtml(pkg.displayPriceUsd)}</div>
          <p class="mk-price-desc">${escapeHtml(pkg.description || "")}</p>
        </div>
        <div>
          <ul>
            ${features.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
        <button type="button" class="mk-btn mk-btn-ghost" data-scroll-download>${escapeHtml(t("planChoose"))}</button>
      </article>
    `;
  }).join("");
  bindScrollCtas(root);
}

function renderCheckoutBanner() {
  const banner = document.getElementById("checkout-banner");
  if (!banner) return;
  const url = new URL(window.location.href);
  const state = (url.searchParams.get("onboarderCheckout") || "").trim().toLowerCase();
  if (!state) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.className = `mk-banner ${state === "success" ? "success" : "warn"}`;
  banner.textContent = state === "success" ? t("bannerSuccess") : t("bannerCancel");
}

function resolveTrustNotes(offer) {
  const local = offer?.trustNotesI18n?.[currentLanguage];
  if (Array.isArray(local) && local.length) return local;
  const en = offer?.trustNotesI18n?.en;
  if (Array.isArray(en) && en.length) return en;
  if (Array.isArray(offer?.trustNotes) && offer.trustNotes.length) return offer.trustNotes;
  return [t("trustFallback1"), t("trustFallback2"), t("trustFallback3")];
}

function renderSecurityNotes(offer) {
  const notes = resolveTrustNotes(offer);
  setText("security-card1-body", notes[0] || t("trustFallback1"));
  setText("security-card2-body", notes[1] || t("trustFallback2"));
  setText("security-card3-body", notes[2] || t("trustFallback3"));
}

async function loadOffer() {
  try {
    const response = await fetch("/api/onboarder/public-offer", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`public offer request failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn("Onboarder public offer fallback", error);
    return null;
  }
}

function bindDownloadButtons(root = document) {
  root.querySelectorAll("[data-installer-download]").forEach((node) => {
    if (node.dataset.boundClick === "1") return;
    node.dataset.boundClick = "1";
    node.addEventListener("click", () => {
      startInstallerDownload(node.dataset.installerDownload || "macos");
    });
  });
}

function bindScrollCtas(root = document) {
  root.querySelectorAll("[data-scroll-download]").forEach((node) => {
    if (node.dataset.boundClick === "1") return;
    node.dataset.boundClick = "1";
    node.addEventListener("click", () => {
      scrollToDownloadAnchor();
    });
  });
}

function bindFaq() {
  document.querySelectorAll(".mk-faq-trigger").forEach((node) => {
    if (node.dataset.boundClick === "1") return;
    node.dataset.boundClick = "1";
    node.addEventListener("click", () => {
      const panel = node.nextElementSibling;
      if (!panel) return;
      const expanded = node.getAttribute("aria-expanded") === "true";
      node.setAttribute("aria-expanded", expanded ? "false" : "true");
      panel.hidden = expanded;
    });
  });
}

function bindRevealMotion() {
  const revealNodes = Array.from(document.querySelectorAll(".mk-reveal"));
  if (!revealNodes.length) return;
  revealNodes[0].classList.add("is-visible");

  if (!("IntersectionObserver" in window)) {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      root: null,
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.12
    }
  );

  revealNodes.forEach((node) => observer.observe(node));
}

function bindLanguageSwitcher() {
  const select = document.getElementById("lang-select");
  if (!select) return;
  select.addEventListener("change", () => {
    setLanguage(select.value, { persist: true, syncUrl: true, rerender: true });
  });
}

async function main() {
  currentLanguage = resolveInitialLanguage();
  setLanguage(currentLanguage, { persist: true, syncUrl: true, rerender: false });

  bindDownloadButtons();
  bindScrollCtas();
  bindFaq();
  bindLanguageSwitcher();
  bindRevealMotion();

  currentOffer = await loadOffer();
  renderCheckoutBanner();
  renderSecurityNotes(currentOffer);
  renderPackages(currentOffer);
}

main();
