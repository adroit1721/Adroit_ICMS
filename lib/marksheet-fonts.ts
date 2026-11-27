import { MarksheetFontId } from './types';

export interface MarksheetFontOption {
  id: MarksheetFontId;
  label: string;
  category: 'Institutional Serif' | 'Editorial Sans' | 'Classic';
  cssStack: string;
}

export const MARKSHEET_FONT_OPTIONS: MarksheetFontOption[] = [
  {
    id: 'playfair',
    label: 'Playfair Display (Royal Serif)',
    category: 'Institutional Serif',
    cssStack: "'Playfair Display', Georgia, serif",
  },
  {
    id: 'cormorant',
    label: 'Cormorant Garamond (Archival)',
    category: 'Institutional Serif',
    cssStack: "'Cormorant Garamond', Georgia, serif",
  },
  {
    id: 'cinzel',
    label: 'Cinzel (Ceremonial Crest)',
    category: 'Institutional Serif',
    cssStack: "'Cinzel', Georgia, serif",
  },
  {
    id: 'lora',
    label: 'Lora (Book Serif)',
    category: 'Institutional Serif',
    cssStack: "'Lora', Georgia, serif",
  },
  {
    id: 'crimson',
    label: 'Crimson Pro (Scholarly)',
    category: 'Institutional Serif',
    cssStack: "'Crimson Pro', Georgia, serif",
  },
  {
    id: 'jakarta',
    label: 'Plus Jakarta Sans (Editorial)',
    category: 'Editorial Sans',
    cssStack: "'Plus Jakarta Sans', 'Inter', sans-serif",
  },
  {
    id: 'manrope',
    label: 'Manrope (Crisp Modern)',
    category: 'Editorial Sans',
    cssStack: "'Manrope', 'Inter', sans-serif",
  },
  {
    id: 'dm-sans',
    label: 'DM Sans (Clean Geometric)',
    category: 'Editorial Sans',
    cssStack: "'DM Sans', 'Inter', sans-serif",
  },
  {
    id: 'outfit',
    label: 'Outfit (Contemporary)',
    category: 'Editorial Sans',
    cssStack: "'Outfit', 'Inter', sans-serif",
  },
  {
    id: 'sans',
    label: 'System Sans (Default)',
    category: 'Classic',
    cssStack: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
  },
  {
    id: 'serif',
    label: 'Academic Serif (Default)',
    category: 'Classic',
    cssStack: "'Lora', Georgia, 'Times New Roman', serif",
  },
];

export function resolveMarksheetFontCss(fontId?: MarksheetFontId, fallback: MarksheetFontId = 'sans'): string {
  const target = fontId || fallback;
  const matched = MARKSHEET_FONT_OPTIONS.find((opt) => opt.id === target);
  if (matched) return matched.cssStack;
  return target === 'serif'
    ? "'Lora', Georgia, 'Times New Roman', serif"
    : "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
}
