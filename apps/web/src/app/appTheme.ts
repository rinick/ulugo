import {theme, type ThemeConfig} from 'antd';

export const appTheme = {
  algorithm: [theme.defaultAlgorithm, theme.compactAlgorithm],
  components: {
    Button: {
      defaultHoverBorderColor: '#dc8916',
      defaultHoverColor: '#dc8916',
    },
    Radio: {
      colorPrimary: '#dc8916',
    },
  },
  token: {
    colorPrimary: '#f4b458',
    borderRadius: 6,
    fontFamily: 'var(--ulugo-font-family)',
  },
} satisfies ThemeConfig;
