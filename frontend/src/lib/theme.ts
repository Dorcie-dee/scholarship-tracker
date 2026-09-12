import type { ThemeConfig } from 'antd';

/**
 * Single design-token source for Ant Design. Visual language: cool mist
 * canvas, deep ink type, teal accent — calm academic ops, not purple SaaS.
 */

const FONT_STACK =
  'var(--font-sans), "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const ACCENT = '#0e7490';
export const ACCENT_HOVER = '#155e75';
export const INK = '#0a1628';
export const CANVAS = '#f1f4f8';
export const SURFACE = '#ffffff';
export const BORDER = '#dde3ec';
export const SIDER_BG = '#0a1628';
export const SIDER_BG_ACTIVE = '#122033';

export const theme: ThemeConfig = {
  token: {
    colorPrimary: ACCENT,
    colorInfo: ACCENT,
    colorSuccess: '#047857',
    colorWarning: '#b45309',
    colorError: '#b91c1c',
    colorLink: ACCENT,
    colorLinkHover: ACCENT_HOVER,
    colorText: '#0f172a',
    colorTextSecondary: '#475569',
    colorTextTertiary: '#64748b',
    colorBorder: BORDER,
    colorBorderSecondary: '#e8edf3',
    colorBgContainer: SURFACE,
    colorBgLayout: CANVAS,
    borderRadius: 10,
    borderRadiusLG: 14,
    fontFamily: FONT_STACK,
    fontSize: 14,
    controlHeight: 40,
    controlHeightLG: 44,
    boxShadow:
      '0 1px 2px rgba(10, 22, 40, 0.04), 0 4px 12px rgba(10, 22, 40, 0.04)',
    boxShadowSecondary:
      '0 2px 8px rgba(10, 22, 40, 0.06), 0 8px 24px rgba(10, 22, 40, 0.06)',
    boxShadowTertiary:
      '0 1px 2px rgba(10, 22, 40, 0.03), 0 1px 3px rgba(10, 22, 40, 0.05)',
  },
  components: {
    Layout: {
      headerBg: SURFACE,
      bodyBg: CANVAS,
      siderBg: SIDER_BG,
      headerHeight: 64,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255, 255, 255, 0.68)',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.06)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: ACCENT,
      darkItemSelectedColor: '#ffffff',
      itemBorderRadius: 10,
      itemMarginInline: 10,
      itemHeight: 42,
      iconSize: 16,
    },
    Card: {
      borderRadiusLG: 14,
      paddingLG: 22,
      headerFontSize: 15,
      headerHeight: 56,
    },
    Button: {
      controlHeight: 40,
      controlHeightLG: 44,
      fontWeight: 600,
      primaryShadow: '0 1px 2px rgba(14, 116, 144, 0.2)',
      borderRadius: 10,
    },
    Input: {
      controlHeight: 40,
      borderRadius: 10,
      paddingBlock: 8,
    },
    Select: {
      controlHeight: 40,
      borderRadius: 10,
    },
    Modal: {
      borderRadiusLG: 16,
    },
    Drawer: {
      paddingLG: 24,
    },
    Tabs: {
      titleFontSize: 14,
      horizontalItemGutter: 28,
      inkBarColor: ACCENT,
      itemSelectedColor: ACCENT,
      itemHoverColor: ACCENT_HOVER,
    },
    Tag: {
      borderRadiusSM: 6,
      defaultBg: '#f1f5f9',
    },
    Table: {
      headerBg: '#f8fafc',
      borderRadiusLG: 12,
    },
    Segmented: {
      trackBg: '#e8edf3',
      itemSelectedBg: SURFACE,
      borderRadius: 10,
    },
    Alert: {
      borderRadiusLG: 12,
    },
  },
};
