<script setup>
import DefaultTheme from 'vitepress/theme'
const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #home-hero-actions-after>
      <div class="download-buttons">
        <a href="https://github.com/megasupersoft/Ghosted/releases/download/v0.1.2/Ghosted-0.1.2-arm64.dmg" class="download-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          <span>macOS</span>
        </a>
        <a href="https://github.com/megasupersoft/Ghosted/releases/download/v0.1.2/Ghosted-0.1.2.AppImage" class="download-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a11.966 11.966 0 0 0 .687 2.424c.444 1.217.945 2.07 1.654 2.646.708.577 1.521.841 2.476.841.564 0 1.063-.107 1.523-.306.46-.2.865-.466 1.262-.758.397-.291.77-.543 1.097-.726.326-.183.625-.278.875-.278.249 0 .548.095.874.278.327.183.7.435 1.098.726.397.292.803.558 1.262.758.46.199.959.306 1.523.306.955 0 1.769-.264 2.476-.841.71-.576 1.21-1.43 1.654-2.646.216-.593.418-1.236.584-1.896.089-.352.166-.718.214-1.048.052-.36.087-.704.073-1.035-.013-.318-.057-.638-.179-.971-.246-.67-.828-1.287-1.378-1.907a10.003 10.003 0 0 1-1.143-1.474c-.475-.801-.683-1.552-.746-2.385-.064-.834-.032-1.716-.032-2.596 0-1.386-.089-2.667-.745-3.655C17.283.555 15.95 0 14.37 0h-1.866zM8.55 14.138c.608.01 1.156.462 1.156 1.142 0 .68-.548 1.209-1.155 1.209-.608 0-1.078-.528-1.078-1.209 0-.68.47-1.142 1.077-1.142zm6.884 0c.607 0 1.077.462 1.077 1.142 0 .68-.47 1.209-1.077 1.209-.608 0-1.156-.528-1.156-1.209 0-.68.548-1.142 1.156-1.142z"/>
          </svg>
          <span>Linux</span>
        </a>
        <a href="https://github.com/megasupersoft/Ghosted/releases/latest" class="download-btn download-btn-alt">
          All releases
        </a>
      </div>
    </template>
  </Layout>
</template>

<style scoped>
.download-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 24px;
}

.download-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: background 0.2s ease, transform 0.2s ease;
}

.download-btn:hover {
  background: var(--vp-button-brand-hover-bg);
  transform: translateY(-1px);
}

.download-btn svg {
  flex-shrink: 0;
}

.download-btn-alt {
  background: transparent;
  color: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-1);
}

.download-btn-alt:hover {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-2);
}
</style>
