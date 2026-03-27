import { defineConfig } from 'vitepress'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))

export default defineConfig({
  title: 'Ghosted',
  description: 'One window. Everything mounted. Nothing lost.',
  head: [
    ['link', { rel: 'icon', href: '/ghosted-icon.png' }],
  ],
  appearance: 'dark',
  themeConfig: {
    logo: {
      light: '/ghosted-icon-light.svg',
      dark: '/ghosted-icon-dark.svg',
    },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'GitHub', link: 'https://github.com/megasupersoft/Ghosted' },
      { text: 'Download', link: 'https://github.com/megasupersoft/Ghosted/releases/latest' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Architecture', link: '/guide/architecture' },
            { text: 'Panes', link: '/guide/panes' },
          ],
        },
        {
          text: 'Community',
          items: [
            { text: 'Contributing', link: '/guide/contributing' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/megasupersoft/Ghosted' },
    ],
    footer: {
      message: 'Made by <a href="https://megasupersoft.com">Megasupersoft</a>. Ships with <a href="https://bruceos.com">BruceOS</a>.',
      copyright: `v${pkg.version} — MIT Licensed. Do whatever you want.`,
    },
    search: {
      provider: 'local',
    },
  },
})
