import { useState } from 'react';
import type { MaterialCategory, BusinessCategory } from '@/mocks/materialCenter';
import { formatFileSize, UPLOAD_TYPE_FOLDERS } from '../materialAdapter';

interface Props {
  materialCategories: MaterialCategory[];
  activeCategory: string;
  onSelect: (id: string) => void;
  businessCategories: BusinessCategory[];
  onAddBusiness: (name: string) => void | Promise<void>;
  onDeleteBusiness: (id: string) => void | Promise<void>;
  totalBytes: number;
  llmOutputCount?: number;
  llmOutputTypeCounts?: Partial<Record<'doc' | 'video' | 'image' | 'audio', number>>;
}

const SYS = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  bgCard: '#ffffff',
  bgPage: '#f0f4fa',
  borderBase: '#e2e8f0',
  primary: '#3b82f6',
  primaryBg: '#eff6ff',
  textMain: '#0f172a',
  textSub: '#64748b',
  textMuted: '#94a3b8',
  radius: 10,
  radiusSM: 8,
};

const MaterialSidebar = ({
  materialCategories,
  activeCategory,
  onSelect,
  totalBytes,
  llmOutputCount,
  llmOutputTypeCounts,
}: Props) => {
  const [expanded, setExpanded] = useState<string[]>(['upload', 'platform-outputs']);
  const toggle = (id: string) =>
    setExpanded((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const navBtn = (isActive: boolean) => ({
    width: '100%' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    padding: '9px 12px',
    borderRadius: SYS.radiusSM,
    border: 'none' as const,
    background: isActive ? SYS.primaryBg : 'transparent',
    color: isActive ? SYS.primary : SYS.textSub,
    cursor: 'pointer' as const,
    fontFamily: SYS.fontFamily,
    fontSize: 14,
    fontWeight: isActive ? 600 : 400,
    textAlign: 'left' as const,
    transition: 'background 0.15s',
    lineHeight: 1.4,
  });

  const childBtn = (isActive: boolean) => ({
    width: '100%' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    padding: '7px 10px',
    borderRadius: 6,
    border: 'none' as const,
    background: isActive ? SYS.primaryBg : 'transparent',
    color: isActive ? SYS.primary : SYS.textSub,
    cursor: 'pointer' as const,
    fontFamily: SYS.fontFamily,
    fontSize: 13,
    fontWeight: isActive ? 600 : 400,
    textAlign: 'left' as const,
    transition: 'background 0.15s',
    lineHeight: 1.4,
  });

  const badge = (isActive: boolean) => ({
    fontSize: 12,
    padding: '1px 6px',
    borderRadius: 4,
    background: isActive ? '#dbeafe' : '#f1f5f9',
    color: isActive ? SYS.primary : SYS.textMuted,
    fontWeight: 500,
    flexShrink: 0 as const,
  });

  const uploadTypeIconByLabel = new Map(UPLOAD_TYPE_FOLDERS.map((item) => [item.label, item.icon]));
  const uploadTypeColorByLabel = new Map([
    ['文档资料', '#3b82f6'],
    ['视频素材', '#8b5cf6'],
    ['图片素材', '#22c55e'],
    ['音频素材', '#ec4899'],
  ]);
  const displayFileTypeLabel = (label: string) =>
    label
      .replace('文档资料', '文档文件')
      .replace('视频素材', '视频文件')
      .replace('图片素材', '图片文件')
      .replace('音频素材', '音频文件');
  const platformTypes = [
    { id: 'platform-outputs:doc', type: 'doc' as const, label: '文档文件', icon: 'ri-file-text-line', color: '#3b82f6' },
    { id: 'platform-outputs:video', type: 'video' as const, label: '视频文件', icon: 'ri-video-line', color: '#8b5cf6' },
    { id: 'platform-outputs:image', type: 'image' as const, label: '图片文件', icon: 'ri-image-2-line', color: '#22c55e' },
    { id: 'platform-outputs:audio', type: 'audio' as const, label: '音频文件', icon: 'ri-music-2-line', color: '#ec4899' },
  ];

  return (
    <aside
      className="material-sidebar"
      style={{
        width: 240,
        flexShrink: 0,
        background: SYS.bgCard,
        borderRight: `1px solid ${SYS.borderBase}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: SYS.fontFamily,
        fontSize: 14,
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${SYS.borderBase}` }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: SYS.textMain, margin: 0 }}>文件分类</h2>
      </div>

      <nav className="migrated-scroll" style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* 平台产出物 — 可展开，置于顶部 */}
        {(() => {
          const isPlatformActive = activeCategory === 'platform-outputs' || activeCategory.startsWith('platform-outputs:');
          const isExp = expanded.includes('platform-outputs');
          return (
            <div>
              <button
                type="button"
                onClick={() => { onSelect('platform-outputs'); toggle('platform-outputs'); }}
                style={navBtn(isPlatformActive)}
                onMouseEnter={(e) => { if (!isPlatformActive) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { if (!isPlatformActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isPlatformActive ? SYS.primary : SYS.textMuted }}>
                  <i className="ri-robot-line" style={{ fontSize: 16 }} />
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>平台产出物</span>
                {llmOutputCount !== undefined && (
                  <span style={badge(isPlatformActive)}>
                    {llmOutputCount}
                  </span>
                )}
                <i className="ri-arrow-down-s-line" style={{ fontSize: 15, color: SYS.textMuted, transition: 'transform 0.2s', transform: isExp ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
              </button>
              {isExp && (
                <div style={{ marginLeft: 12, paddingLeft: 8, borderLeft: `1px solid ${SYS.borderBase}`, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {platformTypes.map((pt) => {
                    const isCA = activeCategory === pt.id;
                    return (
                      <button
                        key={pt.id}
                        type="button"
                        onClick={() => onSelect(pt.id)}
                        style={childBtn(isCA)}
                        onMouseEnter={(e) => { if (!isCA) e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { if (!isCA) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <i className={pt.icon} style={{ fontSize: 14, color: isCA ? SYS.primary : pt.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.label}</span>
                        <span style={badge(isCA)}>{llmOutputTypeCounts?.[pt.type] ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Divider */}
        <div style={{ padding: '6px 4px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 1, background: SYS.borderBase }} />
          <span style={{ fontSize: 12, color: SYS.textMuted, fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>手动上传</span>
          <div style={{ flex: 1, height: 1, background: SYS.borderBase }} />
        </div>

        {materialCategories.filter((cat) => cat.id !== 'all').map((cat: MaterialCategory) => {
          const isActive = activeCategory === cat.id;
          const isExp = expanded.includes(cat.id);
          const hasChildren = !!cat.children?.length;

          return (
            <div key={cat.id}>
              <button
                type="button"
                onClick={() => { onSelect(cat.id); if (hasChildren) toggle(cat.id); }}
                style={navBtn(isActive)}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isActive ? SYS.primary : SYS.textMuted }}>
                  <i className={cat.icon} style={{ fontSize: 16 }} />
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</span>
                <span style={badge(isActive)}>{cat.count}</span>
                {hasChildren && (
                  <i className="ri-arrow-down-s-line" style={{ fontSize: 15, color: SYS.textMuted, transition: 'transform 0.2s', transform: isExp ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
                )}
              </button>

              {hasChildren && isExp && (
                <div style={{ marginLeft: 12, paddingLeft: 8, borderLeft: `1px solid ${SYS.borderBase}`, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {cat.children!.map((child) => {
                    const isCA = activeCategory === child.id;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onSelect(child.id)}
                        style={childBtn(isCA)}
                        onMouseEnter={(e) => { if (!isCA) e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { if (!isCA) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <i
                          className={uploadTypeIconByLabel.get(child.label) ?? 'ri-file-line'}
                          style={{ fontSize: 14, color: isCA ? SYS.primary : uploadTypeColorByLabel.get(child.label) ?? SYS.textMuted, flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayFileTypeLabel(child.label)}</span>
                        <span style={badge(isCA)}>{child.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      </nav>

      {/* Storage */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${SYS.borderBase}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 13, color: SYS.textSub, fontWeight: 500 }}>已用空间</span>
          <span style={{ fontSize: 13, color: SYS.primary, fontWeight: 600 }}>{formatFileSize(totalBytes)}</span>
        </div>
      </div>
    </aside>
  );
};

export default MaterialSidebar;
