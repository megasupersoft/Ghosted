<script setup>
import DefaultTheme from 'vitepress/theme'
const { Layout } = DefaultTheme

const version = '0.1.2'
const macUrl = `https://github.com/megasupersoft/Ghosted/releases/download/v${version}/Ghosted-${version}-arm64.dmg`
const linuxUrl = `https://github.com/megasupersoft/Ghosted/releases/download/v${version}/Ghosted-${version}.AppImage`
</script>

<template>
  <Layout>
    <template #home-hero-actions-after>
      <div class="download-buttons">
        <a :href="macUrl" class="download-btn download-btn--primary">
          <div class="download-btn__icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
          </div>
          <div class="download-btn__text">
            <span class="download-btn__label">Download for macOS</span>
            <span class="download-btn__meta">v{{ version }} &middot; Apple Silicon &middot; DMG</span>
          </div>
        </a>
        <a :href="linuxUrl" class="download-btn download-btn--secondary">
          <div class="download-btn__icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a11.966 11.966 0 0 0 .687 2.424c.444 1.217.945 2.07 1.654 2.646.708.577 1.521.841 2.476.841.564 0 1.063-.107 1.523-.306.46-.2.865-.466 1.262-.758.397-.291.77-.543 1.097-.726.326-.183.625-.278.875-.278.249 0 .548.095.874.278.327.183.7.435 1.098.726.397.292.803.558 1.262.758.46.199.959.306 1.523.306.955 0 1.769-.264 2.476-.841.71-.576 1.21-1.43 1.654-2.646.216-.593.418-1.236.584-1.896.089-.352.166-.718.214-1.048.052-.36.087-.704.073-1.035-.013-.318-.057-.638-.179-.971-.246-.67-.828-1.287-1.378-1.907a10.003 10.003 0 0 1-1.143-1.474c-.475-.801-.683-1.552-.746-2.385-.064-.834-.032-1.716-.032-2.596 0-1.386-.089-2.667-.745-3.655C17.283.555 15.95 0 14.37 0h-1.866zM8.55 14.138c.608.01 1.156.462 1.156 1.142 0 .68-.548 1.209-1.155 1.209-.608 0-1.078-.528-1.078-1.209 0-.68.47-1.142 1.077-1.142zm6.884 0c.607 0 1.077.462 1.077 1.142 0 .68-.47 1.209-1.077 1.209-.608 0-1.156-.528-1.156-1.209 0-.68.548-1.142 1.156-1.142z"/>
            </svg>
          </div>
          <div class="download-btn__text">
            <span class="download-btn__label">Download for Linux</span>
            <span class="download-btn__meta">v{{ version }} &middot; x86_64 &middot; AppImage</span>
          </div>
        </a>
      </div>
    </template>
  </Layout>
</template>

<style scoped>
.download-buttons {
  display: flex;
  gap: 12px;
  padding-top: 24px;
}

@media (max-width: 639px) {
  .download-buttons {
    flex-direction: column;
    width: 100%;
  }
}

.download-btn {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-radius: 10px;
  text-decoration: none;
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid transparent;
}

.download-btn:hover {
  transform: translateY(-1px);
}

.download-btn:active {
  transform: translateY(0);
}

/* Primary — filled brand button */
.download-btn--primary {
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  border-color: var(--vp-button-brand-bg);
}

.download-btn--primary:hover {
  background: var(--vp-button-brand-hover-bg);
  border-color: var(--vp-button-brand-hover-bg);
  box-shadow: 0 4px 12px rgba(107, 92, 231, 0.25);
}

.dark .download-btn--primary:hover {
  box-shadow: 0 4px 12px rgba(176, 168, 240, 0.2);
}

/* Secondary — outline button */
.download-btn--secondary {
  background: transparent;
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-border);
}

.download-btn--secondary:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

/* Icon container */
.download-btn__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.15);
}

.download-btn--secondary .download-btn__icon {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

/* Text block */
.download-btn__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  text-align: left;
}

.download-btn__label {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.3;
}

.download-btn__meta {
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.02em;
  line-height: 1.3;
  opacity: 0.7;
  font-family: var(--vp-font-family-mono);
}
</style>
