/**
 * Gallery themes: token documents compiled by theme.compiler.js when the app starts. Each one has its own palette,
 * typefaces, corners and effects, and a light and a dark variant (`darkMode` says which one is written here; the
 * other is written beside it or balanced from it). `effects` are extra custom properties the component styles read.
 */

const palette = (colors) => Object.fromEntries(['background', 'surface', 'surfaceAccent', 'border', 'text', 'textContrast', 'primary', 'secondary', 'tertiary', 'success', 'warning', 'error'].map((key, i) => [key, colors[i]]));

const theme = (slug, name, description, darkMode, colors, fonts, radii, effects = {}, other = null) => ({
    slug, name, description,
    tokens: {
        darkMode,
        colors: palette(colors),
        other: other && palette(other),
        fonts: { primary: fonts[0], secondary: fonts[1], monospace: fonts[2] },
        radii: { base: radii[0], card: radii[1], input: radii[2], button: radii[3], checkbox: radii[4] ?? '0.25rem', progress: radii[5] ?? '9999px', notification: radii[1], fab: radii[6] ?? '50%' },
        effects
    }
});

const wash = (...layers) => ({ 'page-ambient': layers.join(', '), 'page-ambient-size': '160% 160%', 'page-ambient-motion': 'page-ambient-drift 24s ease-in-out infinite alternate' });
const glow = (tone, size = '22px') => ({ 'card-shadow': `0 0 ${size} -8px color-mix(in srgb, var(--${tone}-color) 55%, transparent)`, 'card-shadow-hover': `0 0 34px -6px color-mix(in srgb, var(--${tone}-color) 75%, transparent)` });
const hard = (x, tone = 'text') => ({ 'card-shadow': `${x} ${x} 0 var(--${tone}-color)`, 'card-shadow-hover': `calc(${x} + 2px) calc(${x} + 2px) 0 var(--${tone}-color)` });
const tint = (tone, share) => `color-mix(in srgb, var(--${tone}-color) ${share}%, transparent)`;

export const GALLERY_THEMES = [
    theme('terminal', 'Terminal', 'Phosphor green on black, all monospace, square edges', true,
        ['#050A06', '#0B140D', '#15281B', '#235A36', '#B8FFC9', '#04140A', '#35E06B', '#E8C547', '#4FD1C5', '#35E06B', '#E8C547', '#FF6B5E'],
        ['ibm-plex-mono', 'vt323', 'ibm-plex-mono'], ['0', '0', '0', '0', '0', '0', '0'],
        { 'page-ambient': `repeating-linear-gradient(0deg, ${tint('primary', 5)} 0 1px, transparent 1px 4px)`, ...glow('primary', '18px') }),

    theme('brutalist', 'Brutalist', 'Loud primaries, thick black outlines and hard shadows', false,
        ['#FFE45C', '#FFFFFF', '#FFD0E4', '#0A0A0A', '#0A0A0A', '#FFFFFF', '#2B39FF', '#E0206F', '#00A878', '#0B7A4B', '#9A5B00', '#D0021B'],
        ['space-grotesk', 'archivo-black', 'space-mono'], ['0', '0', '0', '0', '0', '0', '0'],
        { 'edge-width': '2px', ...hard('5px') },
        ['#141414', '#1F1F1F', '#33254A', '#FFE45C', '#FFFBE6', '#0A0A0A', '#FFE45C', '#FF6FAE', '#3DE0B0', '#5FD39A', '#FFC94D', '#FF7A7A']),

    theme('chalkboard', 'Chalkboard', 'Green slate with pastel chalk and hand lettering', true,
        ['#203A33', '#2A4A41', '#345A4F', '#557C6C', '#F4F7EE', '#1A302A', '#FFE08A', '#FFA9BE', '#9BE0FF', '#A8E6A1', '#FFD166', '#FFA59A'],
        ['patrick-hand', 'cabin-sketch', 'nova-mono'], ['0.5rem', '0.75rem', '0.5rem', '0.5rem'],
        { 'edge-width': '2px' }),

    theme('blueprint', 'Blueprint', 'Drafting blue with a grid and technical lettering', true,
        ['#0B3D78', '#0F4A8F', '#134E97', '#6FA8DC', '#EAF4FF', '#0B3D78', '#FFFFFF', '#FFD166', '#9BDBFF', '#9BE8B4', '#FFD166', '#FFB3A7'],
        ['chakra-petch', 'share-tech-mono', 'share-tech-mono'], ['0', '0', '0', '0', '0', '0', '0'],
        { 'page-ambient': `linear-gradient(${tint('text', 7)} 1px, transparent 1px), linear-gradient(90deg, ${tint('text', 7)} 1px, transparent 1px)`, 'page-ambient-size': '32px 32px' },
        ['#EAF2FB', '#FFFFFF', '#D3E4F6', '#8FB4DC', '#0B2F5E', '#FFFFFF', '#0B4FA0', '#8A5A00', '#1F6FA8', '#1B7A4B', '#8A5A00', '#B83A2E']),

    theme('darkroom', 'Darkroom', 'Red safelight and worn typewriter letters', true,
        ['#140606', '#220B0B', '#3A1414', '#5C2320', '#FFD9D2', '#140606', '#FF6A5A', '#FFB199', '#E08A7E', '#C9C27A', '#FFB86B', '#FF8577'],
        ['karla', 'special-elite', 'courier-prime'], ['0.125rem', '0.125rem', '0.125rem', '0.125rem', '0', '0'],
        { ...wash(`radial-gradient(50% 45% at 80% 0%, ${tint('primary', 26)}, transparent 70%)`) })
];
