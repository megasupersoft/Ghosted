import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Ghosted',
  description: 'The dev workspace that never sleeps.',
  head: [
    ['link', { rel: 'icon', href: '/ghosted-icon.png' }],
  ],
  appearance: 'dark',
  themeConfig: {
    logo: '/ghosted-icon.png',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
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
      message: 'Built by Megasupersoft Ltd.',
      copyright: 'MIT License',
    },
    search: {
      provider: 'local',
    },
  },
})
