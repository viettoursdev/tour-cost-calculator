import { describe, it, expect } from 'vitest';
import {
  normalizePresets, activeLayout, setActiveLayout, switchPreset,
  addPreset, renamePreset, deletePreset, DEFAULT_PRESET_NAME, MAX_PRESETS,
} from './homePresets';
import { defaultHomeLayout, type HomeLayout } from './homeLayout';

const catalog = ['todo', 'process', 'soon'];

describe('normalizePresets', () => {
  it('null → 1 preset "Mặc định" với layout mặc định', () => {
    const s = normalizePresets(catalog, null);
    expect(s.presets).toHaveLength(1);
    expect(s.presets[0].name).toBe(DEFAULT_PRESET_NAME);
    expect(s.activeId).toBe(s.presets[0].id);
    expect(activeLayout(s)).toEqual(defaultHomeLayout(catalog));
  });

  it('blob cũ là HomeLayout (có order) → gói thành 1 preset', () => {
    const legacy: HomeLayout = { order: ['soon', 'todo', 'process'], hidden: ['todo'], collapsed: [], rowsPer: 10, docsDays: 90, tourDays: 7 };
    const s = normalizePresets(catalog, legacy);
    expect(s.presets).toHaveLength(1);
    expect(activeLayout(s).order).toEqual(['soon', 'todo', 'process']);
    expect(activeLayout(s).hidden).toEqual(['todo']);
  });

  it('v2 → giữ presets + reconcile từng layout; activeId sai → về cái đầu', () => {
    const v2 = {
      activeId: 'nope',
      presets: [
        { id: 'a', name: 'Sáng', layout: { order: ['soon'], hidden: [], collapsed: [], rowsPer: 5 } },
        { id: 'b', name: 'Sales', layout: { order: ['todo'], hidden: [], collapsed: [], rowsPer: 5 } },
      ],
    };
    const s = normalizePresets(catalog, v2);
    expect(s.presets.map((p) => p.name)).toEqual(['Sáng', 'Sales']);
    expect(s.activeId).toBe('a');
    // reconcile thêm id còn thiếu vào cuối
    expect(activeLayout(s).order).toEqual(['soon', 'todo', 'process']);
  });
});

describe('thao tác preset', () => {
  it('setActiveLayout chỉ đổi preset đang chọn', () => {
    let s = normalizePresets(catalog, null);
    s = addPreset(s, 'Sales');                 // active = Sales
    const firstId = s.presets[0].id;
    s = setActiveLayout(s, { order: ['todo'], hidden: ['todo'], collapsed: [], rowsPer: 3, docsDays: 90, tourDays: 7 });
    expect(activeLayout(s).hidden).toEqual(['todo']);
    expect(s.presets.find((p) => p.id === firstId)!.layout.hidden).toEqual([]); // không đụng cái kia
  });

  it('add clone layout hiện tại + thành active; switch đổi active', () => {
    let s = normalizePresets(catalog, null);
    s = setActiveLayout(s, { order: ['soon'], hidden: [], collapsed: [], rowsPer: 5, docsDays: 90, tourDays: 7 });
    const firstId = s.activeId;
    s = addPreset(s, 'Vận hành');
    expect(s.presets).toHaveLength(2);
    expect(activeLayout(s).order).toEqual(['soon']); // clone từ cái trước
    s = switchPreset(s, firstId);
    expect(s.activeId).toBe(firstId);
  });

  it('rename + delete (giữ tối thiểu 1, xoá active → về cái đầu)', () => {
    let s = addPreset(normalizePresets(catalog, null), 'B');
    s = renamePreset(s, s.activeId, 'Đã đổi');
    expect(s.presets.find((p) => p.id === s.activeId)!.name).toBe('Đã đổi');
    const activeBefore = s.activeId;
    s = deletePreset(s, activeBefore);
    expect(s.presets).toHaveLength(1);
    expect(s.activeId).toBe(s.presets[0].id);
    const single = deletePreset(s, s.activeId);
    expect(single.presets).toHaveLength(1); // không xoá cái cuối
  });

  it('giới hạn MAX_PRESETS', () => {
    let s = normalizePresets(catalog, null);
    for (let i = 0; i < MAX_PRESETS + 3; i++) s = addPreset(s, `P${i}`);
    expect(s.presets.length).toBe(MAX_PRESETS);
  });
});
