const FALLBACK_PACKAGES = [
  {
    packageId: "starter-openclaw",
    displayName: "Starter OpenClaw",
    description: "基础安装与模型配置引导。",
    displayPriceUsd: 8,
    includedCapabilities: ["runtime-contract", "diagnostics", "model-guides"]
  },
  {
    packageId: "work-openclaw",
    displayName: "Work OpenClaw",
    description: "办公技能 + 图片处理能力。",
    displayPriceUsd: 16,
    includedCapabilities: ["office-skills", "image-model-guides", "dashboard-core"]
  },
  {
    packageId: "vision-openclaw",
    displayName: "Vision OpenClaw",
    description: "视频工作流 + 发布能力。",
    displayPriceUsd: 29,
    includedCapabilities: ["video-workflows", "publish-workflows", "video-model-guides"]
  },
  {
    packageId: "builder-openclaw",
    displayName: "Builder OpenClaw",
    description: "工程协作与项目协议框架。",
    displayPriceUsd: 79,
    includedCapabilities: ["project-protocol-framework", "collaboration-controls", "workflow-manifest"]
  }
];

const PACKAGE_LEVEL = {
  "starter-openclaw": "基础",
  "work-openclaw": "进阶",
  "vision-openclaw": "高级",
  "builder-openclaw": "专业"
};

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

function renderPackages(offer) {
  const root = document.getElementById("onb-package-grid");
  if (!root) return;
  const packages = Array.isArray(offer?.packages) && offer.packages.length ? offer.packages : FALLBACK_PACKAGES;
  root.innerHTML = packages.map((pkg) => {
    const bill = packageBillingStatus(offer, pkg.packageId);
    const enabled = Boolean(bill.configured);
    const features = (pkg.includedCapabilities || []).slice(0, 5);
    return `
      <article class="glass-card pricing-card ${enabled ? "" : "is-disabled"}">
        <div class="title-row">
          <h3>${pkg.displayName}</h3>
          <span class="level">${PACKAGE_LEVEL[pkg.packageId] || "标准"}</span>
        </div>
        <p>${pkg.description}</p>
        <div class="price">$${pkg.displayPriceUsd}</div>
        <ul>
          ${features.map((item) => `<li>${item}</li>`).join("")}
        </ul>
        <button type="button" class="btn btn-ghost" data-scroll-download>选择套餐</button>
      </article>
    `;
  }).join("");
  bindScrollCtas();
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
  banner.className = `banner ${state === "success" ? "success" : "warn"}`;
  banner.textContent = state === "success"
    ? "支付回跳已检测，订单确认中。请继续在安装器完成安装。"
    : "支付被取消。你可以先下载并继续安装流程。";
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

function bindDownloadButtons() {
  document.querySelectorAll("[data-installer-download]").forEach((node) => {
    node.addEventListener("click", () => {
      startInstallerDownload(node.dataset.installerDownload || "macos");
    });
  });
}

function bindScrollCtas() {
  document.querySelectorAll("[data-scroll-download]").forEach((node) => {
    node.addEventListener("click", () => {
      scrollToDownloadAnchor();
    });
  });
}

function bindFaq() {
  document.querySelectorAll(".faq-trigger").forEach((node) => {
    node.addEventListener("click", () => {
      const panel = node.nextElementSibling;
      if (!panel) return;
      const expanded = node.getAttribute("aria-expanded") === "true";
      node.setAttribute("aria-expanded", expanded ? "false" : "true");
      panel.hidden = expanded;
    });
  });
}

async function main() {
  bindDownloadButtons();
  bindScrollCtas();
  bindFaq();
  renderCheckoutBanner();
  const offer = await loadOffer();
  renderPackages(offer);
}

main();
