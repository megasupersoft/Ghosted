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
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
            </svg>
          </div>
          <div class="download-btn__text">
            <span class="download-btn__label">Download for macOS</span>
            <span class="download-btn__meta">v{{ version }} &middot; Apple Silicon &middot; DMG</span>
          </div>
        </a>
        <a :href="linuxUrl" class="download-btn download-btn--secondary">
          <div class="download-btn__icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
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
  padding: 14px 24px;
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
  width: 40px;
  height: 40px;
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
  font-size: 15px;
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
