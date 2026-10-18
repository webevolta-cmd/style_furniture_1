/**
 * Furniture range and colour-configurator data.
 *
 * Categories: client-confirmed range (beds, sofas, armchairs, kitchen furniture,
 * wardrobes/cabinets, other furniture) – also listed in the business's own
 * Instagram captions. `image` keys refer to entries in src/data/images.json.
 */
export type CategoryKey = 'beds' | 'sofas' | 'armchairs' | 'kitchens' | 'wardrobes' | 'other';

export interface Category {
  key: CategoryKey;
  /** value used by the inquiry form <select name="furniture"> */
  formValue: FurnitureType;
  image: string;
  /** true when the picture is a visualization rather than a photograph */
  visualization: boolean;
}

export type FurnitureType = 'bed' | 'sofa' | 'armchair' | 'kitchen' | 'wardrobe' | 'other';

export const furnitureTypes: FurnitureType[] = ['bed', 'sofa', 'armchair', 'kitchen', 'wardrobe', 'other'];

export const categories: Category[] = [
  { key: 'beds', formValue: 'bed', image: 'cat-bed', visualization: true },
  { key: 'sofas', formValue: 'sofa', image: 'cat-sofa', visualization: false },
  { key: 'armchairs', formValue: 'armchair', image: 'cat-armchair', visualization: false },
  { key: 'kitchens', formValue: 'kitchen', image: 'cat-kitchen', visualization: false },
  { key: 'wardrobes', formValue: 'wardrobe', image: 'cat-wardrobe', visualization: true },
  { key: 'other', formValue: 'other', image: 'cat-other', visualization: false },
];

export interface Finish {
  id: string;
  /** swatch colour shown on the button (close to the lit fabric in that finish's preview) */
  swatch: string;
  /** may contain soft hyphens (U+00AD) so long Armenian names wrap between word parts */
  name: { hy: string; en: string };
}

export interface ConfigProduct {
  id: 'bed' | 'armchair';
  formValue: FurnitureType;
  name: { hy: string; en: string };
  /** preview images live in /media/config/<id>/<finish>-<width>.webp|avif */
  width: number;
  height: number;
  widths: number[];
  defaultFinish: string;
  finishes: Finish[];
  alt: { hy: string; en: string };
}

export const configProducts: ConfigProduct[] = [
  {
    id: 'bed',
    formValue: 'bed',
    name: { hy: 'Մահճակալ՝ շերտավոր գլխամասով', en: 'Bed with layered headboard' },
    width: 1200,
    height: 900,
    widths: [600, 900, 1200],
    defaultFinish: 'ivory',
    finishes: [
      { id: 'ivory', swatch: '#e2d8ca', name: { hy: 'Փղոսկրա\u00ADգույն', en: 'Ivory' } },
      { id: 'sand', swatch: '#b8977a', name: { hy: 'Ավազա\u00ADգույն', en: 'Sand' } },
      { id: 'mocha', swatch: '#704c36', name: { hy: 'Սուրճա\u00ADգույն', en: 'Mocha' } },
      { id: 'olive', swatch: '#746e52', name: { hy: 'Ձիթապտղա\u00ADգույն', en: 'Olive' } },
      { id: 'graphite', swatch: '#433c39', name: { hy: 'Գրաֆիտա\u00ADգույն', en: 'Graphite' } },
      { id: 'terracotta', swatch: '#894931', name: { hy: 'Աղյուսա\u00ADգույն', en: 'Terracotta' } },
      { id: 'black', swatch: '#262321', name: { hy: 'Սև', en: 'Black' } },
    ],
    alt: {
      hy: 'Մահճակալ շերտավոր փափուկ գլխամասով՝ ընտրված գույնով',
      en: 'Bed with a layered upholstered headboard in the selected color',
    },
  },
  {
    id: 'armchair',
    formValue: 'armchair',
    name: { hy: 'Բազկաթոռ՝ կլոր թիկնակով', en: 'Armchair with a rounded back' },
    width: 1276,
    height: 1594,
    widths: [480, 851, 1276],
    defaultFinish: 'taupe',
    finishes: [
      { id: 'taupe', swatch: '#827160', name: { hy: 'Մոխրա\u00ADշագանակա\u00ADգույն', en: 'Taupe' } },
      { id: 'ivory', swatch: '#d6c7b5', name: { hy: 'Փղոսկրա\u00ADգույն', en: 'Ivory' } },
      { id: 'emerald', swatch: '#2f4a3d', name: { hy: 'Զմրուխտա\u00ADգույն', en: 'Emerald' } },
      { id: 'terracotta', swatch: '#824b38', name: { hy: 'Աղյուսա\u00ADգույն', en: 'Terracotta' } },
      { id: 'charcoal', swatch: '#4f4748', name: { hy: 'Ածխա\u00ADգույն', en: 'Charcoal' } },
      { id: 'dustyblue', swatch: '#70767c', name: { hy: 'Փոշե\u00ADկապույտ', en: 'Dusty blue' } },
      { id: 'black', swatch: '#24211f', name: { hy: 'Սև', en: 'Black' } },
    ],
    alt: {
      hy: 'Թավշյա բազկաթոռներ կլոր թիկնակով՝ ընտրված գույնով, սպասասրահում',
      en: 'Velvet armchairs with rounded backs in the selected color, in a waiting area',
    },
  },
];
