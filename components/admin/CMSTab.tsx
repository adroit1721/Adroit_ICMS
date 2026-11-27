'use client';

import { useState } from 'react';
import { useERPStore } from '@/lib/store';
import {
  CMSConfig,
  CommitteeMember,
  CustomAboutSection,
  FooterColumn,
  HeaderLayoutStyle,
  LeadershipCard,
  NavbarMenuItem,
} from '@/lib/types';
import MediaUploadInput from './MediaUploadInput';
import { FOOTER_ICON_OPTIONS, NAV_ICON_OPTIONS, RenderCmsIcon } from '@/lib/cms-icons';
import {
  LayoutTemplate,
  Home,
  Building2,
  Megaphone,
  FileText,
  PanelBottom,
  Save,
  CheckCircle2,
  Power,
  Plus,
  Trash2,
  Edit3,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Users,
  CloudUpload,
} from 'lucide-react';

type CmsSectionTab = 'header' | 'homepage' | 'about' | 'notices' | 'pages' | 'footer';

const CMS_TABS: Array<{ id: CmsSectionTab; label: string; icon: typeof LayoutTemplate }> = [
  { id: 'header', label: '1. Header & Branding', icon: LayoutTemplate },
  { id: 'homepage', label: '2. Homepage', icon: Home },
  { id: 'about', label: '3. About Us', icon: Building2 },
  { id: 'notices', label: '4. Notices', icon: Megaphone },
  { id: 'pages', label: '5. Pages Control', icon: FileText },
  { id: 'footer', label: '6. Footer', icon: PanelBottom },
];

export default function CMSTab() {
  const { isHydrated } = useERPStore();
  return <CMSTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function CMSTabInner() {
  const {
    state,
    dbStatus,
    updateCMSConfig,
    toggleAdmissionBadge,
    toggleResultsBadge,
    addNotice,
    deleteNotice,
  } = useERPStore();
  const { cmsConfig, notices, students, teachers } = state;

  const [activeTab, setActiveTab] = useState<CmsSectionTab>('header');
  const [draft, setDraft] = useState<CMSConfig>(() => ({
    ...cmsConfig,
    navMenuItems: cmsConfig.navMenuItems || [],
    heroSlides: cmsConfig.heroSlides || [],
    extraLeadershipCards: cmsConfig.extraLeadershipCards || [],
    atAGlanceHighlights: cmsConfig.atAGlanceHighlights || [],
    smcMembers: cmsConfig.smcMembers || [],
    customAboutSections: cmsConfig.customAboutSections || [],
    footerColumns: cmsConfig.footerColumns || [],
  }));
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Header nav editor helpers
  const [expandedNavId, setExpandedNavId] = useState<string | null>(null);
  const [newNavLabel, setNewNavLabel] = useState('');
  const [newNavHref, setNewNavHref] = useState('');
  const [newNavIcon, setNewNavIcon] = useState('Globe');

  // Slide editor helpers
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [newSlideTitle, setNewSlideTitle] = useState('');
  const [newSlideSub, setNewSlideSub] = useState('');
  const [newSlideImg, setNewSlideImg] = useState('');
  const [newSlidePublicId, setNewSlidePublicId] = useState('');
  const [newSlideBadge, setNewSlideBadge] = useState('Campus Park');

  // Leadership card edit expand
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);

  // Notice publisher state
  const [newNoticeTitle, setNewNoticeTitle] = useState('');
  const [newNoticeCategory, setNewNoticeCategory] = useState<'academic' | 'admissions' | 'examinations'>('academic');
  const [newNoticeBadge, setNewNoticeBadge] = useState<'New' | 'Exam' | 'Results' | 'Notice'>('New');
  const [newNoticeDesc, setNewNoticeDesc] = useState('');
  const [newNoticeFile, setNewNoticeFile] = useState('');
  const [noticeAddedMsg, setNoticeAddedMsg] = useState(false);

  // SMC add row state
  const [newSmc, setNewSmc] = useState({ name: '', designation: '', mobile: '', email: '' });
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionDesc, setNewSectionDesc] = useState('');
  const [customMemberDraft, setCustomMemberDraft] = useState<Record<string, { name: string; designation: string; mobile: string; email: string }>>({});

  // Footer add column state
  const [newFooterColTitle, setNewFooterColTitle] = useState('');

  // Alumni add state
  const [newAlum, setNewAlum] = useState({ name: '', batch: '', achievement: '' });

  const commitDraft = (next: CMSConfig) => {
    setDraft(next);
    updateCMSConfig({
      ...next,
      stats: {
        enrolledStudents: `${students.length}+ (Live DB)`,
        certifiedFaculty: `${teachers.length}+ (Live DB)`,
        alumniNetwork: next.stats.alumniNetwork,
      },
    });
  };

  const handleSaveAll = () => {
    commitDraft(draft);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // --- NAVBAR MENU HELPERS ---
  const navItems = draft.navMenuItems || [];
  const updateNavItems = (items: NavbarMenuItem[]) => {
    commitDraft({ ...draft, navMenuItems: items });
  };

  const handleAddNavItem = () => {
    if (!newNavLabel.trim() || !newNavHref.trim()) return;
    const item: NavbarMenuItem = {
      id: `nav-${Date.now()}`,
      label: newNavLabel.trim(),
      href: newNavHref.trim(),
      icon: newNavIcon || undefined,
      visible: true,
    };
    updateNavItems([...navItems, item]);
    setNewNavLabel('');
    setNewNavHref('');
    setNewNavIcon('Globe');
  };

  const moveNavItem = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= navItems.length) return;
    const copy = [...navItems];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    updateNavItems(copy);
  };

  // --- HERO SLIDE HELPERS ---
  const handleAddSlide = () => {
    if (!newSlideTitle.trim()) return;
    const updatedSlides = [
      ...draft.heroSlides,
      {
        id: `slide-${Date.now()}`,
        imageUrl: newSlideImg.trim(),
        imagePublicId: newSlideImg.trim() ? newSlidePublicId || undefined : undefined,
        title: newSlideTitle.trim(),
        subtitle: newSlideSub.trim(),
        badgeText: newSlideBadge.trim() || 'Campus Highlight',
      },
    ];
    commitDraft({ ...draft, heroSlides: updatedSlides });
    setNewSlideTitle('');
    setNewSlideSub('');
    setNewSlideImg('');
    setNewSlidePublicId('');
  };

  const updateSlideField = (
    id: string,
    field: 'title' | 'subtitle' | 'badgeText' | 'imageUrl' | 'imagePublicId',
    val: string
  ) => {
    const nextSlides = draft.heroSlides.map((s) => (s.id === id ? { ...s, [field]: val } : s));
    setDraft({ ...draft, heroSlides: nextSlides });
  };

  const moveSlide = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= draft.heroSlides.length) return;
    const copy = [...draft.heroSlides];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    commitDraft({ ...draft, heroSlides: copy });
  };

  const handleDeleteSlide = (id: string) => {
    commitDraft({
      ...draft,
      heroSlides: draft.heroSlides.filter((s) => s.id !== id),
    });
  };

  // --- LEADERSHIP CARDS HELPERS ---
  const extraCards = draft.extraLeadershipCards || [];
  const handleAddLeadershipCard = () => {
    const created: LeadershipCard = {
      id: `lead-${Date.now()}`,
      sectionTitle: 'Message from the Vice Principal',
      name: 'Vice Principal Name',
      designation: 'Vice Principal (Academic)',
      subDesignation: cmsConfig.schoolName,
      honoraryBadge: 'Academic Administration',
      photoUrl: '',
      quote: 'Consistent mentorship and disciplined inquiry unlock every student’s full potential.',
      speech:
        'Our faculty teams work closely with families to ensure continuous academic growth and moral character building.',
      visible: true,
    };
    const next = { ...draft, extraLeadershipCards: [...extraCards, created] };
    commitDraft(next);
    setEditingLeadId(created.id);
  };

  // --- SMC & CUSTOM ABOUT SECTIONS HELPERS ---
  const smcList = draft.smcMembers || [];
  const handleAddSmcMember = () => {
    if (!newSmc.name.trim() || !newSmc.designation.trim()) return;
    const created: CommitteeMember = {
      id: `smc-${Date.now()}`,
      name: newSmc.name.trim(),
      designation: newSmc.designation.trim(),
      mobile: newSmc.mobile.trim() || '—',
      email: newSmc.email.trim() || '—',
      category: 'Committee Member',
    };
    commitDraft({ ...draft, smcMembers: [...smcList, created] });
    setNewSmc({ name: '', designation: '', mobile: '', email: '' });
  };

  const customSections = draft.customAboutSections || [];
  const handleAddCustomSection = () => {
    if (!newSectionTitle.trim()) return;
    const created: CustomAboutSection = {
      id: `sec-${Date.now()}`,
      title: newSectionTitle.trim(),
      subtitle: 'Institutional Committee',
      description: newSectionDesc.trim(),
      visible: true,
      members: [],
    };
    commitDraft({ ...draft, customAboutSections: [...customSections, created] });
    setNewSectionTitle('');
    setNewSectionDesc('');
  };

  const handleAddCustomSectionMember = (sectionId: string) => {
    const entry = customMemberDraft[sectionId];
    if (!entry?.name?.trim() || !entry?.designation?.trim()) return;
    const updatedSections = customSections.map((sec) =>
      sec.id === sectionId
        ? {
            ...sec,
            members: [
              ...sec.members,
              {
                id: `mem-${Date.now()}`,
                name: entry.name.trim(),
                designation: entry.designation.trim(),
                mobile: entry.mobile?.trim() || '—',
                email: entry.email?.trim() || '—',
              },
            ],
          }
        : sec
    );
    commitDraft({ ...draft, customAboutSections: updatedSections });
    setCustomMemberDraft((prev) => ({
      ...prev,
      [sectionId]: { name: '', designation: '', mobile: '', email: '' },
    }));
  };

  // --- FOOTER HELPERS ---
  const footerCols = draft.footerColumns || [];
  const handleAddFooterCol = () => {
    if (!newFooterColTitle.trim()) return;
    const newCol: FooterColumn = {
      id: `fcol-${Date.now()}`,
      title: newFooterColTitle.trim(),
      links: [{ id: `fl-${Date.now()}`, label: 'Sample Link', href: '/', icon: 'Globe' }],
    };
    commitDraft({ ...draft, footerColumns: [...footerCols, newCol] });
    setNewFooterColTitle('');
  };

  // --- NOTICE PUBLISHER ---
  const handleAddNotice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoticeTitle.trim()) return;

    addNotice({
      title: newNoticeTitle.trim(),
      category: newNoticeCategory,
      badge: newNoticeBadge,
      description: newNoticeDesc.trim(),
      fileName: newNoticeFile.trim() || undefined,
    });

    setNewNoticeTitle('');
    setNewNoticeDesc('');
    setNewNoticeFile('');
    setNoticeAddedMsg(true);
    setTimeout(() => setNoticeAddedMsg(false), 3000);
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Top Bar: Title + Master Save + Live Website Toggles */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
        <div>
          <span className="text-xs uppercase tracking-wider text-primary-container font-semibold">
            Institutional Brand &amp; Content Management
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            Website CMS Control Center
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Manage header layout, Cloudinary logo &amp; favicon, homepage slider, leadership messages, About Us committees, pages, and footer columns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={toggleAdmissionBadge}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
              cmsConfig.isAdmissionOpen
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
            }`}
          >
            Admissions: {cmsConfig.isAdmissionOpen ? 'Open' : 'Paused'}
          </button>

          <button
            type="button"
            onClick={toggleResultsBadge}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
              cmsConfig.isResultsPublished
                ? 'bg-sky-50 text-sky-800 border-sky-200'
                : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
            }`}
          >
            Results Badge: {cmsConfig.isResultsPublished ? 'Published' : 'Hidden'}
          </button>

          <button
            type="button"
            onClick={() => updateCMSConfig({ isMaintenanceMode: !cmsConfig.isMaintenanceMode })}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
              cmsConfig.isMaintenanceMode
                ? 'bg-error text-on-error border-error'
                : 'bg-surface-container-low text-on-surface border-outline-variant/30 hover:bg-surface-container'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{cmsConfig.isMaintenanceMode ? 'Maintenance ON' : 'Site Live'}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>Save &amp; Publish All</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>All Website CMS changes saved and synchronized live with the public website.</span>
        </div>
      )}

      {/* Navigation: Tab Bar (Desktop) + Dropdown Selector (Mobile/Quick Jump) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest/90 border border-outline-variant/25 rounded-2xl p-2">
        <div className="hidden lg:flex items-center gap-1 flex-wrap">
          {CMS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-primary-container text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="lg:hidden w-full">
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 px-1">
            Select CMS Module Section
          </label>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as CmsSectionTab)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-bold text-on-surface focus:outline-none"
          >
            {CMS_TABS.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        <span className="hidden xl:block text-[11px] text-on-surface-variant pr-3 font-medium">
          Auto-syncs to public pages on Save
        </span>
      </div>

      {/* ================= TAB 1: HEADER & BRANDING ================= */}
      {activeTab === 'header' && (
        <div className="space-y-6">
          {/* Cloudinary Configuration + Logo & Favicon Uploads */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2.5">
                <CloudUpload className="w-5 h-5 text-primary-container" />
                <div>
                  <h2 className="text-base font-bold text-on-surface">
                    School Logo, Site Favicon &amp; Cloudinary Media Setup
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    Upload the institutional crest and browser tab favicon directly to Cloudinary (or save locally if preset is blank).
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-on-surface flex items-center gap-2">
                  <span>Server-Signed Cloudinary Asset Storage</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      dbStatus.cloudinaryConfigured
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {dbStatus.cloudinaryConfigured ? 'Connected' : 'Env Vars Missing'}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Images upload directly via signed server credentials (<code className="font-mono">CLOUDINARY_*</code> env vars) and old assets are automatically destroyed on replacement or deletion.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MediaUploadInput
                label="School Crest / Official Logo"
                value={draft.crestUrl}
                onChange={(url) => commitDraft({ ...draft, crestUrl: url })}
                onChangeMedia={({ url, publicId }) =>
                  commitDraft({
                    ...draft,
                    crestUrl: url,
                    crestPublicId: publicId ?? (url.trim() ? draft.crestPublicId : ''),
                  })
                }
                folder="erp/cms"
                helperText="Displayed in the public website header, footer, and PDF marksheets."
                previewShape="square"
                maxWidth={512}
              />

              <MediaUploadInput
                label="Website Favicon (.png / .ico / .svg)"
                value={draft.faviconUrl}
                onChange={(url) => commitDraft({ ...draft, faviconUrl: url })}
                onChangeMedia={({ url, publicId }) =>
                  commitDraft({
                    ...draft,
                    faviconUrl: url,
                    faviconPublicId: publicId ?? (url.trim() ? draft.faviconPublicId : ''),
                  })
                }
                folder="erp/cms"
                helperText="Updates the browser tab icon immediately across the public portal."
                previewShape="icon"
                maxWidth={128}
              />
            </div>
          </div>

          {/* Core Identity & Statutory Codes */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-outline-variant/20">
              <div>
                <h2 className="text-base font-bold text-on-surface">
                  Institution Core Identity, Browser Tab Name &amp; Statutory Codes
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Configure the official school name, browser tab site title, tagline, and statutory board identifiers.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-xs cursor-pointer self-start sm:self-auto"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Apply Branding</span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  School Name
                </label>
                <input
                  type="text"
                  value={draft.schoolName}
                  onChange={(e) => setDraft({ ...draft, schoolName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Browser Tab Site Title
                </label>
                <input
                  type="text"
                  placeholder={draft.schoolName || 'e.g. Dhaka Model School & College'}
                  value={draft.siteTitle ?? ''}
                  onChange={(e) => setDraft({ ...draft, siteTitle: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm font-medium"
                />
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Shown in the browser tab &amp; bookmarks (defaults to School Name if blank).
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Tagline / Institutional Motto
                </label>
                <input
                  type="text"
                  value={draft.motto}
                  onChange={(e) => setDraft({ ...draft, motto: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  EIIN Number
                </label>
                <input
                  type="text"
                  value={draft.eiin}
                  onChange={(e) => setDraft({ ...draft, eiin: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Board Code
                </label>
                <input
                  type="text"
                  value={draft.boardCode}
                  onChange={(e) => setDraft({ ...draft, boardCode: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Official Email
                </label>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Phone / Hotline
                </label>
                <input
                  type="text"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Campus Physical Address
                </label>
                <input
                  type="text"
                  value={draft.address}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Header Layout Switcher */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-on-surface">Public Header Layout Style</h2>
              <p className="text-xs text-on-surface-variant">
                Switch how the school crest, title, announcements, portals, and navbar are arranged on the public site.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(
                [
                  {
                    id: 'classic-centered',
                    title: 'Centered Crest & 3-Tier Navbar',
                    desc: 'Top-left announcements, top-right portals, centered logo + name + tagline, navbar below.',
                  },
                  {
                    id: 'compact-split',
                    title: 'Split Header + Bottom Navbar',
                    desc: 'Logo & school name left-aligned with portals right-aligned, centered navbar underneath.',
                  },
                  {
                    id: 'minimal-bar',
                    title: 'Compact Single Utility & Nav',
                    desc: 'Slim top status/portal strip over a single-row brand & inline navigation bar.',
                  },
                ] as Array<{ id: HeaderLayoutStyle; title: string; desc: string }>
              ).map((opt) => {
                const selected = (draft.headerLayout || 'classic-centered') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => commitDraft({ ...draft, headerLayout: opt.id })}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer space-y-1.5 ${
                      selected
                        ? 'border-primary-container bg-primary-fixed/25 shadow-xs'
                        : 'border-outline-variant/30 bg-surface-container-low/50 hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface">{opt.title}</span>
                      {selected && (
                        <span className="text-[11px] font-bold text-primary-container">Active</span>
                      )}
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navbar Items & Submenus Editor */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-outline-variant/20">
              <div>
                <h2 className="text-base font-bold text-on-surface">
                  Navbar Menu Items &amp; Dropdown Submenus
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Rename, reorder, hide, or add top navigation links and dropdown sub-items.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {navItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/25 space-y-3"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveNavItem(idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg bg-white border border-outline-variant/30 text-on-surface-variant disabled:opacity-40 cursor-pointer"
                        title="Move Left / Up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveNavItem(idx, 1)}
                        disabled={idx === navItems.length - 1}
                        className="p-1.5 rounded-lg bg-white border border-outline-variant/30 text-on-surface-variant disabled:opacity-40 cursor-pointer"
                        title="Move Right / Down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-outline-variant/30">
                      {item.icon ? (
                        <RenderCmsIcon name={item.icon} className="w-3.5 h-3.5 text-primary-container shrink-0" />
                      ) : (
                        <span className="text-[10px] text-on-surface-variant font-mono px-0.5">—</span>
                      )}
                      <select
                        aria-label={`Icon for ${item.label}`}
                        value={item.icon || ''}
                        onChange={(e) =>
                          updateNavItems(
                            navItems.map((n) =>
                              n.id === item.id ? { ...n, icon: e.target.value || undefined } : n
                            )
                          )
                        }
                        className="bg-transparent text-xs font-medium text-on-surface focus:outline-none cursor-pointer"
                      >
                        {NAV_ICON_OPTIONS.map((opt) => (
                          <option key={opt.value || 'none'} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          navMenuItems: navItems.map((n) =>
                            n.id === item.id ? { ...n, label: e.target.value } : n
                          ),
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-white border border-outline-variant/30 text-xs font-bold w-36"
                    />

                    <input
                      type="text"
                      value={item.href}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          navMenuItems: navItems.map((n) =>
                            n.id === item.id ? { ...n, href: e.target.value } : n
                          ),
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-white border border-outline-variant/30 text-xs font-mono flex-1 min-w-[130px]"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        updateNavItems(
                          navItems.map((n) =>
                            n.id === item.id ? { ...n, visible: !n.visible } : n
                          )
                        )
                      }
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                        item.visible
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {item.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{item.visible ? 'Shown' : 'Hidden'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedNavId(expandedNavId === item.id ? null : item.id)
                      }
                      className="px-3 py-1.5 rounded-xl bg-white border border-outline-variant/30 text-xs font-semibold text-primary-container cursor-pointer"
                    >
                      Submenus ({item.children?.length || 0})
                    </button>

                    <button
                      type="button"
                      onClick={() => updateNavItems(navItems.filter((n) => n.id !== item.id))}
                      className="p-1.5 rounded-xl text-error hover:bg-error-container/20 cursor-pointer"
                      title="Remove Menu Item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {expandedNavId === item.id && (
                    <div className="pl-4 sm:pl-8 pt-2 border-t border-outline-variant/20 space-y-2">
                      {(item.children || []).map((sub) => (
                        <div key={sub.id} className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-outline-variant/30">
                            <RenderCmsIcon
                              name={sub.icon || 'FileText'}
                              className="w-3.5 h-3.5 text-primary-container shrink-0"
                            />
                            <select
                              aria-label={`Submenu icon for ${sub.label}`}
                              value={sub.icon || 'FileText'}
                              onChange={(e) =>
                                updateNavItems(
                                  navItems.map((n) =>
                                    n.id === item.id
                                      ? {
                                          ...n,
                                          children: (n.children || []).map((c) =>
                                            c.id === sub.id ? { ...c, icon: e.target.value } : c
                                          ),
                                        }
                                      : n
                                  )
                                )
                              }
                              className="bg-transparent text-xs font-medium text-on-surface focus:outline-none cursor-pointer"
                            >
                              {NAV_ICON_OPTIONS.filter((o) => o.value !== '').map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <input
                            type="text"
                            value={sub.label}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                navMenuItems: navItems.map((n) =>
                                  n.id === item.id
                                    ? {
                                        ...n,
                                        children: (n.children || []).map((c) =>
                                          c.id === sub.id ? { ...c, label: e.target.value } : c
                                        ),
                                      }
                                    : n
                                ),
                              })
                            }
                            placeholder="Submenu label"
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-xs font-semibold w-44"
                          />
                          <input
                            type="text"
                            value={sub.href}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                navMenuItems: navItems.map((n) =>
                                  n.id === item.id
                                    ? {
                                        ...n,
                                        children: (n.children || []).map((c) =>
                                          c.id === sub.id ? { ...c, href: e.target.value } : c
                                        ),
                                      }
                                    : n
                                ),
                              })
                            }
                            placeholder="/path#anchor"
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-xs font-mono w-40"
                          />
                          <input
                            type="text"
                            value={sub.description}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                navMenuItems: navItems.map((n) =>
                                  n.id === item.id
                                    ? {
                                        ...n,
                                        children: (n.children || []).map((c) =>
                                          c.id === sub.id
                                            ? { ...c, description: e.target.value }
                                            : c
                                        ),
                                      }
                                    : n
                                ),
                              })
                            }
                            placeholder="Short description"
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-xs flex-1 min-w-[150px]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateNavItems(
                                navItems.map((n) =>
                                  n.id === item.id
                                    ? {
                                        ...n,
                                        children: (n.children || []).filter((c) => c.id !== sub.id),
                                      }
                                    : n
                                )
                              )
                            }
                            className="p-1.5 text-error hover:bg-error-container/20 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() =>
                          updateNavItems(
                            navItems.map((n) =>
                              n.id === item.id
                                ? {
                                    ...n,
                                    children: [
                                      ...(n.children || []),
                                      {
                                        id: `sub-${Date.now()}`,
                                        label: 'New Sub-Item',
                                        href: item.href,
                                        description: 'Details section',
                                        icon: 'FileText',
                                      },
                                    ],
                                  }
                                : n
                            )
                          )
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-xs font-semibold text-primary-container cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Submenu Link</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
                {newNavIcon ? (
                  <RenderCmsIcon name={newNavIcon} className="w-4 h-4 text-primary-container shrink-0" />
                ) : (
                  <span className="text-[10px] text-on-surface-variant font-mono">No Icon</span>
                )}
                <select
                  aria-label="New Navbar Link Icon"
                  value={newNavIcon}
                  onChange={(e) => setNewNavIcon(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-on-surface focus:outline-none cursor-pointer"
                >
                  {NAV_ICON_OPTIONS.map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>
                      Icon: {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="New Menu Label (e.g. Gallery)"
                value={newNavLabel}
                onChange={(e) => setNewNavLabel(e.target.value)}
                className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs w-48"
              />
              <input
                type="text"
                placeholder="Target Path (e.g. /notices)"
                value={newNavHref}
                onChange={(e) => setNewNavHref(e.target.value)}
                className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-mono w-48"
              />
              <button
                type="button"
                onClick={handleAddNavItem}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Navbar Link</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: HOMEPAGE (HERO SLIDER & LEADERSHIP CARDS) ================= */}
      {activeTab === 'homepage' && (
        <div className="space-y-6">
          {/* Hero Slider Manager */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div>
                <h2 className="text-base font-bold text-on-surface">
                  Hero Image Slider Manager ({draft.heroSlides.length} slides)
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Upload photos, edit existing slides inline, reorder sequence, or delete slides.
                </p>
              </div>
            </div>

            {/* Existing Slides List with Edit / Reorder / Delete */}
            <div className="space-y-3">
              {draft.heroSlides.map((slide, idx) => {
                const isEditing = editingSlideId === slide.id;
                return (
                  <div
                    key={slide.id}
                    className="p-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/25 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {slide.imageUrl ? (
                          <img
                            src={slide.imageUrl}
                            alt={slide.title}
                            className="w-28 h-16 object-cover rounded-xl bg-white border border-outline-variant/20 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-28 h-16 rounded-xl bg-white border border-outline-variant/20 shrink-0 flex items-center justify-center text-[10px] font-semibold text-on-surface-variant">
                            No Image
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-[11px] font-semibold text-primary-container block">
                            Slide {idx + 1} · {slide.badgeText}
                          </span>
                          <h4 className="font-bold text-sm text-on-surface truncate">{slide.title}</h4>
                          <p className="text-xs text-on-surface-variant truncate">{slide.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveSlide(idx, -1)}
                          disabled={idx === 0}
                          className="p-2 rounded-xl bg-white border border-outline-variant/30 text-on-surface-variant disabled:opacity-40 cursor-pointer"
                          title="Move Up"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSlide(idx, 1)}
                          disabled={idx === draft.heroSlides.length - 1}
                          className="p-2 rounded-xl bg-white border border-outline-variant/30 text-on-surface-variant disabled:opacity-40 cursor-pointer"
                          title="Move Down"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSlideId(isEditing ? null : slide.id)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs font-semibold text-primary-container cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isEditing ? 'Done' : 'Edit Slide'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlide(slide.id)}
                          className="p-2 rounded-xl text-error hover:bg-error-container/20 cursor-pointer"
                          title="Delete Slide"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="pt-4 border-t border-outline-variant/20 space-y-4">
                        <MediaUploadInput
                          label="Slide Banner Photo"
                          value={slide.imageUrl}
                          onChange={(url) => updateSlideField(slide.id, 'imageUrl', url)}
                          onChangeMedia={({ url, publicId }) =>
                            setDraft((prev) => ({
                              ...prev,
                              heroSlides: prev.heroSlides.map((s) =>
                                s.id === slide.id
                                  ? {
                                      ...s,
                                      imageUrl: url,
                                      imagePublicId:
                                        publicId ?? (url.trim() ? s.imagePublicId : ''),
                                    }
                                  : s
                              ),
                            }))
                          }
                          folder="erp/cms"
                          previewShape="wide"
                          maxWidth={1600}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                              Slide Title
                            </label>
                            <input
                              type="text"
                              value={slide.title}
                              onChange={(e) => updateSlideField(slide.id, 'title', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                              Badge / Location Tag
                            </label>
                            <input
                              type="text"
                              value={slide.badgeText}
                              onChange={(e) =>
                                updateSlideField(slide.id, 'badgeText', e.target.value)
                              }
                              className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                              Subtitle / Description
                            </label>
                            <input
                              type="text"
                              value={slide.subtitle}
                              onChange={(e) =>
                                updateSlideField(slide.id, 'subtitle', e.target.value)
                              }
                              className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add New Slide Box */}
            <div className="p-5 rounded-2xl bg-surface-container-low/70 border border-outline-variant/20 space-y-4">
              <h3 className="text-sm font-bold text-on-surface">Add New Hero Slide</h3>
              <MediaUploadInput
                label="Upload New Slide Photo (or paste URL)"
                value={newSlideImg}
                onChange={setNewSlideImg}
                onChangeMedia={({ url, publicId }) => {
                  setNewSlideImg(url);
                  setNewSlidePublicId(publicId ?? (url.trim() ? newSlidePublicId : ''));
                }}
                folder="erp/cms"
                previewShape="wide"
                maxWidth={1600}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Slide Title *"
                  value={newSlideTitle}
                  onChange={(e) => setNewSlideTitle(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-white border border-outline-variant/30 text-xs"
                />
                <input
                  type="text"
                  placeholder="Badge / Location Tag (e.g. Science Wing)"
                  value={newSlideBadge}
                  onChange={(e) => setNewSlideBadge(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-white border border-outline-variant/30 text-xs"
                />
                <input
                  type="text"
                  placeholder="Subtitle / Description"
                  value={newSlideSub}
                  onChange={(e) => setNewSlideSub(e.target.value)}
                  className="md:col-span-2 px-3.5 py-2.5 rounded-xl bg-white border border-outline-variant/30 text-xs"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddSlide}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Hero Slide</span>
                </button>
              </div>
            </div>
          </div>

          {/* Institute Head Message Card (Primary) */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
              <div>
                <h2 className="text-base font-bold text-on-surface">
                  Institute Head / Principal Message Card
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Configure picture, name, designation, sub-designation, honorary badge, quote, speech, and visibility toggle.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  commitDraft({ ...draft, showPrincipalCard: draft.showPrincipalCard === false })
                }
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer shrink-0 ${
                  draft.showPrincipalCard !== false
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {draft.showPrincipalCard !== false ? (
                  <>
                    <Eye className="w-4 h-4" />
                    <span>Visible on Homepage</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4" />
                    <span>Hidden from Homepage</span>
                  </>
                )}
              </button>
            </div>

            <MediaUploadInput
              label="Head Teacher / Principal Picture"
              value={draft.principalPhotoUrl}
              onChange={(url) => commitDraft({ ...draft, principalPhotoUrl: url })}
              onChangeMedia={({ url, publicId }) =>
                commitDraft({
                  ...draft,
                  principalPhotoUrl: url,
                  principalPhotoPublicId: publicId ?? (url.trim() ? draft.principalPhotoPublicId : ''),
                })
              }
              folder="erp/cms"
              previewShape="square"
              maxWidth={600}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={draft.principalName}
                  onChange={(e) => setDraft({ ...draft, principalName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  value={draft.principalDesignation}
                  onChange={(e) => setDraft({ ...draft, principalDesignation: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Institute / Sub-Designation
                </label>
                <input
                  type="text"
                  value={draft.principalSubDesignation || ''}
                  onChange={(e) => setDraft({ ...draft, principalSubDesignation: e.target.value })}
                  placeholder="e.g. Ph.D. (Oxon) • Governing Trust"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Honorary Badge / Tag
                </label>
                <input
                  type="text"
                  value={draft.principalBadge || ''}
                  onChange={(e) => setDraft({ ...draft, principalBadge: e.target.value })}
                  placeholder="e.g. Head of Institution"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Highlight Quote
                </label>
                <input
                  type="text"
                  value={draft.principalQuote}
                  onChange={(e) => setDraft({ ...draft, principalQuote: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Full Speech / Address
                </label>
                <textarea
                  rows={4}
                  value={draft.principalNarrative}
                  onChange={(e) => setDraft({ ...draft, principalNarrative: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Additional Leadership Cards Below (Vice Principal / SMC President / etc.) */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
              <div>
                <h2 className="text-base font-bold text-on-surface">
                  Additional Leadership Cards (Vice Principal, SMC President, etc.)
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Add extra message cards below the main Institute Head card and toggle their visibility anytime.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddLeadershipCard}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-semibold cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add Message Card</span>
              </button>
            </div>

            <div className="space-y-4">
              {extraCards.length === 0 ? (
                <p className="text-xs text-on-surface-variant italic">
                  No additional leadership cards configured yet. Click &ldquo;Add Message Card&rdquo; to add a Vice Principal or SMC President block.
                </p>
              ) : (
                extraCards.map((card) => {
                  const isOpen = editingLeadId === card.id;
                  return (
                    <div
                      key={card.id}
                      className="p-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/25 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {card.photoUrl ? (
                            <img
                              src={card.photoUrl}
                              alt={card.name}
                              className="w-12 h-12 rounded-xl object-cover shrink-0 bg-white"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-primary-fixed/50 text-primary-container font-bold text-xs flex items-center justify-center shrink-0">
                              {card.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold text-primary-container">
                              {card.sectionTitle}
                            </div>
                            <div className="text-sm font-bold text-on-surface truncate">
                              {card.name}
                            </div>
                            <div className="text-xs text-on-surface-variant truncate">
                              {card.designation}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              commitDraft({
                                ...draft,
                                extraLeadershipCards: extraCards.map((c) =>
                                  c.id === card.id ? { ...c, visible: !c.visible } : c
                                ),
                              })
                            }
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                              card.visible
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {card.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{card.visible ? 'Displayed' : 'Hidden'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingLeadId(isOpen ? null : card.id)}
                            className="px-3 py-1.5 rounded-xl bg-white border border-outline-variant/30 text-xs font-semibold text-primary-container cursor-pointer"
                          >
                            {isOpen ? 'Collapse' : 'Edit Card'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              commitDraft({
                                ...draft,
                                extraLeadershipCards: extraCards.filter((c) => c.id !== card.id),
                              })
                            }
                            className="p-1.5 text-error hover:bg-error-container/20 rounded-xl cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="pt-4 border-t border-outline-variant/20 space-y-4">
                          <MediaUploadInput
                            label="Portrait Picture"
                            value={card.photoUrl}
                            onChange={(url) =>
                              setDraft({
                                ...draft,
                                extraLeadershipCards: extraCards.map((c) =>
                                  c.id === card.id ? { ...c, photoUrl: url } : c
                                ),
                              })
                            }
                            onChangeMedia={({ url, publicId }) =>
                              setDraft((prev) => ({
                                ...prev,
                                extraLeadershipCards: (prev.extraLeadershipCards || []).map((c) =>
                                  c.id === card.id
                                    ? {
                                        ...c,
                                        photoUrl: url,
                                        photoPublicId: publicId ?? (url.trim() ? c.photoPublicId : ''),
                                      }
                                    : c
                                ),
                              }))
                            }
                            folder="erp/cms"
                            maxWidth={600}
                          />

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                                Card Heading
                              </label>
                              <input
                                type="text"
                                value={card.sectionTitle}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    extraLeadershipCards: extraCards.map((c) =>
                                      c.id === card.id ? { ...c, sectionTitle: e.target.value } : c
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                                Honorary Badge / Tag
                              </label>
                              <input
                                type="text"
                                value={card.honoraryBadge}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    extraLeadershipCards: extraCards.map((c) =>
                                      c.id === card.id
                                        ? { ...c, honoraryBadge: e.target.value }
                                        : c
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                                Full Name
                              </label>
                              <input
                                type="text"
                                value={card.name}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    extraLeadershipCards: extraCards.map((c) =>
                                      c.id === card.id ? { ...c, name: e.target.value } : c
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                                Designation
                              </label>
                              <input
                                type="text"
                                value={card.designation}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    extraLeadershipCards: extraCards.map((c) =>
                                      c.id === card.id ? { ...c, designation: e.target.value } : c
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                                Institute / Sub-Designation
                              </label>
                              <input
                                type="text"
                                value={card.subDesignation}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    extraLeadershipCards: extraCards.map((c) =>
                                      c.id === card.id
                                        ? { ...c, subDesignation: e.target.value }
                                        : c
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                                Highlight Quote
                              </label>
                              <input
                                type="text"
                                value={card.quote}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    extraLeadershipCards: extraCards.map((c) =>
                                      c.id === card.id ? { ...c, quote: e.target.value } : c
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                                Full Speech
                              </label>
                              <textarea
                                rows={3}
                                value={card.speech}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    extraLeadershipCards: extraCards.map((c) =>
                                      c.id === card.id ? { ...c, speech: e.target.value } : c
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: ABOUT US PAGE ================= */}
      {activeTab === 'about' && (
        <div className="space-y-6">
          {/* i. School History & At a Glance */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-5">
            <h2 className="text-base font-bold text-on-surface pb-3 border-b border-outline-variant/20">
              i. School Details, History &amp; At a Glance Counters
            </h2>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                School Heritage &amp; Overview Narrative
              </label>
              <textarea
                rows={4}
                value={draft.aboutContent}
                onChange={(e) => setDraft({ ...draft, aboutContent: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/20">
                <div className="text-[11px] font-semibold text-on-surface-variant uppercase">
                  Active Students (Live DB)
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-primary-container mt-1">
                  {students.length}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/20">
                <div className="text-[11px] font-semibold text-on-surface-variant uppercase">
                  Teachers &amp; Staff (Live DB)
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-secondary mt-1">
                  {teachers.length}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Alumni Network Count Display
                </label>
                <input
                  type="text"
                  value={draft.stats.alumniNetwork}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stats: { ...draft.stats, alumniNetwork: e.target.value },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* ii. Teachers & Staff DB Sync Status */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-primary-fixed/50 text-primary-container shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-on-surface">
                  ii. Teachers &amp; Staffs Cards (Live Database Sync)
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Automatically displays all {teachers.length} active records from the Faculty Directory module with Picture Avatar, Name, Designation, Mobile, and Email on <code className="font-mono">/about#teachers-staff</code>.
                </p>
              </div>
            </div>
          </div>

          {/* iii. School Managing Committee (SMC) Editable Data Table */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-on-surface">
                iii. School Managing Committee (SMC) Data Table
              </h2>
              <p className="text-xs text-on-surface-variant">
                Customize member names, designations, mobile numbers, and emails rendered in the governance table on <code className="font-mono">/about#smc</code>.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-outline-variant/25">
              <table className="w-full text-left text-xs border-collapse bg-white">
                <thead>
                  <tr className="bg-surface-container-low font-bold text-on-surface border-b border-outline-variant/25">
                    <th className="p-3">Member Name</th>
                    <th className="p-3">Designation</th>
                    <th className="p-3">Mobile</th>
                    <th className="p-3">Email</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {smcList.map((m) => (
                    <tr key={m.id}>
                      <td className="p-2">
                        <input
                          type="text"
                          value={m.name}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              smcMembers: smcList.map((row) =>
                                row.id === m.id ? { ...row, name: e.target.value } : row
                              ),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low/50 border border-outline-variant/25 text-xs font-semibold"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={m.designation}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              smcMembers: smcList.map((row) =>
                                row.id === m.id ? { ...row, designation: e.target.value } : row
                              ),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low/50 border border-outline-variant/25 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={m.mobile}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              smcMembers: smcList.map((row) =>
                                row.id === m.id ? { ...row, mobile: e.target.value } : row
                              ),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low/50 border border-outline-variant/25 text-xs font-mono tabular-nums"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={m.email}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              smcMembers: smcList.map((row) =>
                                row.id === m.id ? { ...row, email: e.target.value } : row
                              ),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low/50 border border-outline-variant/25 text-xs"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            commitDraft({
                              ...draft,
                              smcMembers: smcList.filter((row) => row.id !== m.id),
                            })
                          }
                          className="p-1.5 text-error hover:bg-error-container/20 rounded-lg cursor-pointer"
                          title="Delete Member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
              <input
                type="text"
                placeholder="Member Name *"
                value={newSmc.name}
                onChange={(e) => setNewSmc({ ...newSmc, name: e.target.value })}
                className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
              />
              <input
                type="text"
                placeholder="Designation *"
                value={newSmc.designation}
                onChange={(e) => setNewSmc({ ...newSmc, designation: e.target.value })}
                className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
              />
              <input
                type="text"
                placeholder="Mobile"
                value={newSmc.mobile}
                onChange={(e) => setNewSmc({ ...newSmc, mobile: e.target.value })}
                className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-mono"
              />
              <input
                type="email"
                placeholder="Email"
                value={newSmc.email}
                onChange={(e) => setNewSmc({ ...newSmc, email: e.target.value })}
                className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
              />
              <button
                type="button"
                onClick={handleAddSmcMember}
                className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            </div>
          </div>

          {/* iv. Extra Custom Committee Sections (e.g. PTA Committee) */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-on-surface">
                iv. Additional Committees &amp; Custom About Sections (e.g., PTA Committee)
              </h2>
              <p className="text-xs text-on-surface-variant">
                Add custom committees or institutional groups with their own member table.
              </p>
            </div>

            {customSections.map((sec) => {
              const memInput = customMemberDraft[sec.id] || {
                name: '',
                designation: '',
                mobile: '',
                email: '',
              };
              return (
                <div
                  key={sec.id}
                  className="p-5 rounded-2xl bg-surface-container-low/60 border border-outline-variant/25 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <input
                      type="text"
                      value={sec.title}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          customAboutSections: customSections.map((s) =>
                            s.id === sec.id ? { ...s, title: e.target.value } : s
                          ),
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-white border border-outline-variant/30 text-sm font-bold flex-1 min-w-[220px]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          commitDraft({
                            ...draft,
                            customAboutSections: customSections.map((s) =>
                              s.id === sec.id ? { ...s, visible: !s.visible } : s
                            ),
                          })
                        }
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                          sec.visible
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {sec.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{sec.visible ? 'Visible' : 'Hidden'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          commitDraft({
                            ...draft,
                            customAboutSections: customSections.filter((s) => s.id !== sec.id),
                          })
                        }
                        className="p-1.5 text-error hover:bg-error-container/20 rounded-xl cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={sec.description}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        customAboutSections: customSections.map((s) =>
                          s.id === sec.id ? { ...s, description: e.target.value } : s
                        ),
                      })
                    }
                    placeholder="Section description..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                  />

                  <div className="overflow-x-auto rounded-xl border border-outline-variant/25 bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-surface-container-low font-bold border-b border-outline-variant/20">
                          <th className="p-2.5">Name</th>
                          <th className="p-2.5">Designation</th>
                          <th className="p-2.5">Mobile</th>
                          <th className="p-2.5">Email</th>
                          <th className="p-2.5 text-right">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20">
                        {sec.members.map((mem) => (
                          <tr key={mem.id}>
                            <td className="p-2.5 font-semibold">{mem.name}</td>
                            <td className="p-2.5">{mem.designation}</td>
                            <td className="p-2.5 font-mono tabular-nums">{mem.mobile}</td>
                            <td className="p-2.5">{mem.email}</td>
                            <td className="p-2.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  commitDraft({
                                    ...draft,
                                    customAboutSections: customSections.map((s) =>
                                      s.id === sec.id
                                        ? {
                                            ...s,
                                            members: s.members.filter((m) => m.id !== mem.id),
                                          }
                                        : s
                                    ),
                                  })
                                }
                                className="text-error p-1 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    <input
                      type="text"
                      placeholder="Name *"
                      value={memInput.name}
                      onChange={(e) =>
                        setCustomMemberDraft((prev) => ({
                          ...prev,
                          [sec.id]: { ...memInput, name: e.target.value },
                        }))
                      }
                      className="px-2.5 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Designation *"
                      value={memInput.designation}
                      onChange={(e) =>
                        setCustomMemberDraft((prev) => ({
                          ...prev,
                          [sec.id]: { ...memInput, designation: e.target.value },
                        }))
                      }
                      className="px-2.5 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Mobile"
                      value={memInput.mobile}
                      onChange={(e) =>
                        setCustomMemberDraft((prev) => ({
                          ...prev,
                          [sec.id]: { ...memInput, mobile: e.target.value },
                        }))
                      }
                      className="px-2.5 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs font-mono"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={memInput.email}
                      onChange={(e) =>
                        setCustomMemberDraft((prev) => ({
                          ...prev,
                          [sec.id]: { ...memInput, email: e.target.value },
                        }))
                      }
                      className="px-2.5 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCustomSectionMember(sec.id)}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-semibold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Row</span>
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="New Section Title (e.g. Cultural & Sports Committee)"
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
              />
              <input
                type="text"
                placeholder="Short committee description"
                value={newSectionDesc}
                onChange={(e) => setNewSectionDesc(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs"
              />
              <button
                type="button"
                onClick={handleAddCustomSection}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add New About Section</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: NOTICE BOARD PUBLISHER ================= */}
      {activeTab === 'notices' && (
        <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-6">
          <div className="pb-3 border-b border-outline-variant/20">
            <h2 className="text-base font-bold text-on-surface">
              Institutional Circulars &amp; Notice Board Publisher
            </h2>
            <p className="text-xs text-on-surface-variant">
              Publish notices with category filtering and PDF circular attachments.
            </p>
          </div>

          {noticeAddedMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4" />
              <span>New circular published successfully to the Public Notice Board.</span>
            </div>
          )}

          <form onSubmit={handleAddNotice} className="p-5 rounded-2xl bg-surface-container-low/70 space-y-4">
            <h3 className="text-sm font-bold text-on-surface">Publish New Official Circular</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">
                  Notice Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Higher Secondary Board Registration 2025 Circular"
                  value={newNoticeTitle}
                  onChange={(e) => setNewNoticeTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">
                  Category
                </label>
                <select
                  value={newNoticeCategory}
                  onChange={(e) =>
                    setNewNoticeCategory(e.target.value as 'academic' | 'admissions' | 'examinations')
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm"
                >
                  <option value="academic">Academic Circulars</option>
                  <option value="admissions">Admissions &amp; Grants</option>
                  <option value="examinations">Board Examinations</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">
                  Badge Label
                </label>
                <select
                  value={newNoticeBadge}
                  onChange={(e) =>
                    setNewNoticeBadge(e.target.value as 'New' | 'Exam' | 'Results' | 'Notice')
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm"
                >
                  <option value="New">New</option>
                  <option value="Exam">Exam</option>
                  <option value="Results">Results</option>
                  <option value="Notice">Notice</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">
                  Attachment PDF Filename (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Board_Exam_Routine_2025.pdf"
                  value={newNoticeFile}
                  onChange={(e) => setNewNoticeFile(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm font-mono"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">
                  Detailed Body / Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide complete circular details or deadlines..."
                  value={newNoticeDesc}
                  onChange={(e) => setNewNoticeDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow-xs cursor-pointer"
              >
                <Megaphone className="w-4 h-4" />
                <span>Broadcast Circular</span>
              </button>
            </div>
          </form>

          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-on-surface">
              Active Public Notices ({notices.length})
            </h3>
            <div className="divide-y divide-outline-variant/15 border border-outline-variant/20 rounded-2xl overflow-hidden bg-white">
              {notices.map((notice) => (
                <div
                  key={notice.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-surface-container-low/40"
                >
                  <div>
                    <div className="text-xs text-on-surface-variant font-mono">
                      {notice.badge} · {notice.publishDate} · <span className="capitalize">{notice.category}</span>
                      {notice.fileName ? ` · ${notice.fileName}` : ''}
                    </div>
                    <h4 className="text-sm font-bold text-on-surface mt-0.5">{notice.title}</h4>
                    <p className="text-xs text-on-surface-variant line-clamp-1 mt-0.5">
                      {notice.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteNotice(notice.id)}
                    className="p-2 rounded-xl text-error hover:bg-error-container/20 self-end md:self-auto cursor-pointer"
                    title="Remove Notice"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 5: ACADEMICS, ALUMNI & CONTACT PAGE CONTROLS ================= */}
      {activeTab === 'pages' && (
        <div className="space-y-6">
          {/* Academics Controls */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-4">
            <h2 className="text-base font-bold text-on-surface pb-2 border-b border-outline-variant/20">
              Academics Page (<code className="font-mono text-xs">/academics</code>)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Page Main Heading
                </label>
                <input
                  type="text"
                  value={draft.academicsPageConfig?.heading || 'Academics, Routines & Examinations'}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      academicsPageConfig: {
                        ...(draft.academicsPageConfig || {
                          heading: '',
                          showRoutine: true,
                          showFourthSubjectGuide: true,
                        }),
                        heading: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.academicsPageConfig?.showRoutine !== false}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        academicsPageConfig: {
                          ...(draft.academicsPageConfig || {
                            heading: 'Academics, Routines & Examinations',
                            showRoutine: true,
                            showFourthSubjectGuide: true,
                          }),
                          showRoutine: e.target.checked,
                        },
                      })
                    }
                  />
                  Show Weekly Class Routine Table
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.academicsPageConfig?.showFourthSubjectGuide !== false}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        academicsPageConfig: {
                          ...(draft.academicsPageConfig || {
                            heading: 'Academics, Routines & Examinations',
                            showRoutine: true,
                            showFourthSubjectGuide: true,
                          }),
                          showFourthSubjectGuide: e.target.checked,
                        },
                      })
                    }
                  />
                  Show Grading Scale &amp; Subjects
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Curriculum Overview Narrative
                </label>
                <textarea
                  rows={3}
                  value={draft.academicsContent}
                  onChange={(e) => setDraft({ ...draft, academicsContent: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Alumni Page Controls */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <h2 className="text-base font-bold text-on-surface">
                Alumni Page (<code className="font-mono text-xs">/alumni</code>)
              </h2>
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.alumniPageConfig?.showRegistrationForm !== false}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      alumniPageConfig: {
                        ...(draft.alumniPageConfig || {
                          heading: '',
                          subtitle: '',
                          showRegistrationForm: true,
                          featuredAlumni: [],
                        }),
                        showRegistrationForm: e.target.checked,
                      },
                    })
                  }
                />
                Enable Alumni Registration Form
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Alumni Page Heading
                </label>
                <input
                  type="text"
                  value={draft.alumniPageConfig?.heading || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      alumniPageConfig: {
                        ...(draft.alumniPageConfig || {
                          heading: '',
                          subtitle: '',
                          showRegistrationForm: true,
                          featuredAlumni: [],
                        }),
                        heading: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Alumni Subheadline
                </label>
                <input
                  type="text"
                  value={draft.alumniPageConfig?.subtitle || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      alumniPageConfig: {
                        ...(draft.alumniPageConfig || {
                          heading: '',
                          subtitle: '',
                          showRegistrationForm: true,
                          featuredAlumni: [],
                        }),
                        subtitle: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <div className="text-xs font-bold text-on-surface">Featured Alumni Highlights</div>
              {(draft.alumniPageConfig?.featuredAlumni || []).map((al) => (
                <div
                  key={al.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 text-xs"
                >
                  <div>
                    <span className="font-bold text-on-surface">{al.name}</span> ·{' '}
                    <span className="font-mono text-primary-container">{al.batch}</span> —{' '}
                    <span className="text-on-surface-variant">{al.achievement}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      commitDraft({
                        ...draft,
                        alumniPageConfig: {
                          ...draft.alumniPageConfig!,
                          featuredAlumni: (draft.alumniPageConfig?.featuredAlumni || []).filter(
                            (x) => x.id !== al.id
                          ),
                        },
                      })
                    }
                    className="text-error p-1 rounded cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Alumni Full Name"
                  value={newAlum.name}
                  onChange={(e) => setNewAlum({ ...newAlum, name: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
                />
                <input
                  type="text"
                  placeholder="Batch (e.g. Batch of 2015)"
                  value={newAlum.batch}
                  onChange={(e) => setNewAlum({ ...newAlum, batch: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
                />
                <input
                  type="text"
                  placeholder="Achievement / Role"
                  value={newAlum.achievement}
                  onChange={(e) => setNewAlum({ ...newAlum, achievement: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newAlum.name.trim()) return;
                    commitDraft({
                      ...draft,
                      alumniPageConfig: {
                        ...draft.alumniPageConfig!,
                        featuredAlumni: [
                          ...(draft.alumniPageConfig?.featuredAlumni || []),
                          {
                            id: `alum-${Date.now()}`,
                            name: newAlum.name.trim(),
                            batch: newAlum.batch.trim() || 'Alumni',
                            achievement: newAlum.achievement.trim(),
                          },
                        ],
                      },
                    });
                    setNewAlum({ name: '', batch: '', achievement: '' });
                  }}
                  className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Alumni</span>
                </button>
              </div>
            </div>
          </div>

          {/* Contact Page Controls */}
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <h2 className="text-base font-bold text-on-surface">
                Contact Page (<code className="font-mono text-xs">/contact</code>)
              </h2>
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.contactPageConfig?.showInquiryForm !== false}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      contactPageConfig: {
                        ...(draft.contactPageConfig || {
                          heading: '',
                          officeHours: '',
                          mapNote: '',
                          showInquiryForm: true,
                        }),
                        showInquiryForm: e.target.checked,
                      },
                    })
                  }
                />
                Show Inquiry Form
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Contact Section Title
                </label>
                <input
                  type="text"
                  value={draft.contactPageConfig?.heading || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      contactPageConfig: {
                        ...(draft.contactPageConfig || {
                          heading: '',
                          officeHours: '',
                          mapNote: '',
                          showInquiryForm: true,
                        }),
                        heading: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Office Working Hours
                </label>
                <input
                  type="text"
                  value={draft.contactPageConfig?.officeHours || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      contactPageConfig: {
                        ...(draft.contactPageConfig || {
                          heading: '',
                          officeHours: '',
                          mapNote: '',
                          showInquiryForm: true,
                        }),
                        officeHours: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Campus Directions / Map Advisory Note
                </label>
                <input
                  type="text"
                  value={draft.contactPageConfig?.mapNote || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      contactPageConfig: {
                        ...(draft.contactPageConfig || {
                          heading: '',
                          officeHours: '',
                          mapNote: '',
                          showInquiryForm: true,
                        }),
                        mapNote: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 6: FOOTER COLUMNS & COPYRIGHT ================= */}
      {activeTab === 'footer' && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
              <div>
                <h2 className="text-base font-bold text-on-surface">
                  Custom Footer Columns (Social Media, Important Links, Resources)
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Create custom link columns, name each column, add links, and attach Lucide icons.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Column Name (e.g. Social Media)"
                  value={newFooterColTitle}
                  onChange={(e) => setNewFooterColTitle(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs w-52"
                />
                <button
                  type="button"
                  onClick={handleAddFooterCol}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Column</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {footerCols.map((col) => (
                <div
                  key={col.id}
                  className="p-5 rounded-2xl bg-surface-container-low/60 border border-outline-variant/25 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={col.title}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          footerColumns: footerCols.map((fc) =>
                            fc.id === col.id ? { ...fc, title: e.target.value } : fc
                          ),
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-white border border-outline-variant/30 text-sm font-bold flex-1"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        commitDraft({
                          ...draft,
                          footerColumns: footerCols.filter((fc) => fc.id !== col.id),
                        })
                      }
                      className="p-1.5 text-error hover:bg-error-container/20 rounded-xl cursor-pointer"
                      title="Delete Column"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {col.links.map((lnk) => (
                      <div
                        key={lnk.id}
                        className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-white border border-outline-variant/20"
                      >
                        <span className="p-1.5 rounded-lg bg-surface-container-low text-primary-container">
                          <RenderCmsIcon name={lnk.icon} className="w-4 h-4" />
                        </span>

                        <select
                          value={lnk.icon}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              footerColumns: footerCols.map((fc) =>
                                fc.id === col.id
                                  ? {
                                      ...fc,
                                      links: fc.links.map((l) =>
                                        l.id === lnk.id ? { ...l, icon: e.target.value } : l
                                      ),
                                    }
                                  : fc
                              ),
                            })
                          }
                          className="px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/25 text-xs w-36"
                        >
                          {FOOTER_ICON_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          value={lnk.label}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              footerColumns: footerCols.map((fc) =>
                                fc.id === col.id
                                  ? {
                                      ...fc,
                                      links: fc.links.map((l) =>
                                        l.id === lnk.id ? { ...l, label: e.target.value } : l
                                      ),
                                    }
                                  : fc
                              ),
                            })
                          }
                          placeholder="Link label"
                          className="px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/25 text-xs font-medium flex-1 min-w-[120px]"
                        />

                        <input
                          type="text"
                          value={lnk.href}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              footerColumns: footerCols.map((fc) =>
                                fc.id === col.id
                                  ? {
                                      ...fc,
                                      links: fc.links.map((l) =>
                                        l.id === lnk.id ? { ...l, href: e.target.value } : l
                                      ),
                                    }
                                  : fc
                              ),
                            })
                          }
                          placeholder="https://... or /path"
                          className="px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/25 text-xs font-mono w-36"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            commitDraft({
                              ...draft,
                              footerColumns: footerCols.map((fc) =>
                                fc.id === col.id
                                  ? { ...fc, links: fc.links.filter((l) => l.id !== lnk.id) }
                                  : fc
                              ),
                            })
                          }
                          className="text-error p-1.5 hover:bg-error-container/20 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      commitDraft({
                        ...draft,
                        footerColumns: footerCols.map((fc) =>
                          fc.id === col.id
                            ? {
                                ...fc,
                                links: [
                                  ...fc.links,
                                  {
                                    id: `fl-${Date.now()}`,
                                    label: 'New Link',
                                    href: '/',
                                    icon: 'Globe',
                                  },
                                ],
                              }
                            : fc
                        ),
                      })
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-outline-variant/30 text-xs font-semibold text-primary-container cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Link to {col.title}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-6 space-y-4">
            <h2 className="text-base font-bold text-on-surface pb-2 border-b border-outline-variant/20">
              Footer Institutional Summary &amp; Copyright Line
            </h2>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                Footer Description / Summary
              </label>
              <textarea
                rows={2}
                value={draft.footerTagline || ''}
                onChange={(e) => setDraft({ ...draft, footerTagline: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                Copyright Text (Displayed at Bottom Bar)
              </label>
              <input
                type="text"
                value={draft.copyrightText || ''}
                onChange={(e) => setDraft({ ...draft, copyrightText: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Save Bar */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSaveAll}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-md cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Save &amp; Deploy Website CMS Changes</span>
        </button>
      </div>
    </div>
  );
}
