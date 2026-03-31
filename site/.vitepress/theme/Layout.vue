<script setup>
import DefaultTheme from 'vitepress/theme'
const { Layout } = DefaultTheme

const version = '0.1.2'
const macUrl = `https://github.com/megasupersoft/Ghosted/releases/download/v${version}/Ghosted-${version}-arm64.dmg`
const linuxUrl = `https://github.com/megasupersoft/Ghosted/releases/download/v${version}/Ghosted-${version}.AppImage`
const winUrl = `https://github.com/megasupersoft/Ghosted/releases/latest`
</script>

<template>
  <Layout>
    <template #home-hero-actions-after>
      <div class="download-buttons">
        <a :href="macUrl" class="download-btn download-btn--primary">
          <div class="download-btn__icon">
            <!-- Simple Icons: Apple -->
            <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
            </svg>
          </div>
          <div class="download-btn__text">
            <span class="download-btn__label">macOS</span>
            <span class="download-btn__meta">Apple Silicon · DMG</span>
            <span class="download-btn__meta">v{{ version }}</span>
          </div>
        </a>
        <a :href="linuxUrl" class="download-btn download-btn--primary">
          <div class="download-btn__icon">
            <!-- Material Design Icons: Penguin (Tux) — belly filled -->
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19,16C19,17.72 18.37,19.3 17.34,20.5C17.75,20.89 18,21.41 18,22H6C6,21.41 6.25,20.89 6.66,20.5C5.63,19.3 5,17.72 5,16H3C3,14.75 3.57,13.64 4.46,12.91L4.47,12.89C6,11.81 7,10 7,8V7A5,5 0 0,1 12,2A5,5 0 0,1 17,7V8C17,10 18,11.81 19.53,12.89L19.54,12.91C20.43,13.64 21,14.75 21,16H19M10,9L12,10.5L14,9L12,7.5L10,9M10,5A1,1 0 0,0 9,6A1,1 0 0,0 10,7A1,1 0 0,0 11,6A1,1 0 0,0 10,5M14,5A1,1 0 0,0 13,6A1,1 0 0,0 14,7A1,1 0 0,0 15,6A1,1 0 0,0 14,5Z"/>
            </svg>
          </div>
          <div class="download-btn__text">
            <span class="download-btn__label">Linux</span>
            <span class="download-btn__meta">x86_64 · AppImage</span>
            <span class="download-btn__meta">v{{ version }}</span>
          </div>
        </a>
        <a :href="winUrl" class="download-btn download-btn--secondary">
          <div class="download-btn__icon">
            <!-- Simple Icons: Windows -->
            <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="currentColor">
              <path d="M0,0H11.377V11.372H0ZM12.623,0H24V11.372H12.623ZM0,12.623H11.377V24H0Zm12.623,0H24V24H12.623"/>
            </svg>
          </div>
          <div class="download-btn__text">
            <span class="download-btn__label">Windows</span>
            <span class="download-btn__meta">Coming soon</span>
            <span class="download-btn__meta">v{{ version }}</span>
          </div>
        </a>
      </div>
    </template>
    <template #home-hero-after>
      <div class="screenshot-section">
        <img src="/screenshot.png" alt="Ghosted workspace showing editor, canvas, terminal, and knowledge graph panes" />
      </div>
    </template>
  </Layout>
</template>

<style scoped>
.download-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 16px;
  padding-top: 32px;
}

@media (max-width: 959px) {
  .download-buttons {
    justify-content: center;
  }
}

@media (max-width: 639px) {
  .download-buttons {
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
}

.download-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 28px;
  border-radius: 14px;
  text-decoration: none;
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid transparent;
  min-width: 160px;
}

.download-btn:hover {
  transform: translateY(-2px);
}

.download-btn:active {
  transform: translateY(0);
}

/* All buttons — transparent, no border */
.download-btn--primary,
.download-btn--secondary {
  background: transparent;
  color: var(--vp-c-text-1);
  border-color: transparent;
}

.download-btn--primary:hover,
.download-btn--secondary:hover {
  background: var(--vp-c-brand-soft);
}

/* Icon container */
.download-btn__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 72px;
  height: 72px;
}

.download-btn__icon {
  color: var(--vp-c-brand-1);
}

/* Text block */
.download-btn__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: center;
}

.download-btn__label {
  font-size: 17px;
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
  white-space: nowrap;
}

/* Screenshot */
.screenshot-section {
  max-width: 1152px;
  margin: 0 auto;
  padding: 48px 24px 80px;
}

.screenshot-section img {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--vp-c-border);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
  display: block;
}

/* How It Works link */
.how-it-works {
  padding-top: 20px;
}

.how-it-works__link {
  font-size: 15px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
  transition: color 0.2s ease;
}

.how-it-works__link:hover {
  color: var(--vp-c-brand-2);
}
</style>
