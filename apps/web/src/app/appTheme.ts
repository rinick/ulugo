import {theme, type ThemeConfig} from 'antd';

export function createAppTheme(darkMode: boolean): ThemeConfig {
  return {
    algorithm: [darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm, theme.compactAlgorithm],
    cssVar: {key: 'ulugo'},
    components: {
      Button: {
        defaultHoverBorderColor: '#dc8916',
        defaultHoverColor: '#a16614',
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
  };
}
