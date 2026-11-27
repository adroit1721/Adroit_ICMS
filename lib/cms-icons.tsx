'use client';

import {
  Globe,
  Facebook,
  Youtube,
  Linkedin,
  Instagram,
  Twitter,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  FileText,
  Award,
  BookOpen,
  Users,
  GraduationCap,
  Calendar,
  ShieldCheck,
  Building2,
  Home,
  Megaphone,
  Image as ImageIcon,
  BarChart3,
  ClipboardList,
  Compass,
  Sparkles,
} from 'lucide-react';

export const NAV_ICON_OPTIONS = [
  { value: '', label: 'No Icon' },
  { value: 'Home', label: 'Home' },
  { value: 'Building2', label: 'About / Campus' },
  { value: 'GraduationCap', label: 'Academics / Admission' },
  { value: 'BookOpen', label: 'Curriculum / Library' },
  { value: 'Calendar', label: 'Routine / Events' },
  { value: 'Award', label: 'Exams / Results' },
  { value: 'Megaphone', label: 'Notice / Broadcast' },
  { value: 'Users', label: 'Alumni / Faculty' },
  { value: 'ClipboardList', label: 'Admission / Forms' },
  { value: 'Image', label: 'Gallery / Media' },
  { value: 'FileText', label: 'Documents / Circulars' },
  { value: 'BarChart3', label: 'At a Glance / Stats' },
  { value: 'ShieldCheck', label: 'Governance / Rules' },
  { value: 'Compass', label: 'Clubs / Co-curricular' },
  { value: 'Sparkles', label: 'Highlights / Achievements' },
  { value: 'Phone', label: 'Contact / Hotline' },
  { value: 'Mail', label: 'Email' },
  { value: 'MapPin', label: 'Location / Map' },
  { value: 'Globe', label: 'Portal / Website' },
  { value: 'ExternalLink', label: 'External Link' },
] as const;

export const FOOTER_ICON_OPTIONS = [
  { value: 'Globe', label: 'Website / Globe' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'Youtube', label: 'YouTube' },
  { value: 'Linkedin', label: 'LinkedIn' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Twitter', label: 'X / Twitter' },
  { value: 'Mail', label: 'Email' },
  { value: 'Phone', label: 'Phone' },
  { value: 'MapPin', label: 'Location Pin' },
  { value: 'BookOpen', label: 'Curriculum / Book' },
  { value: 'Calendar', label: 'Calendar / Routine' },
  { value: 'GraduationCap', label: 'Admission / Scholar' },
  { value: 'FileText', label: 'Notice / Document' },
  { value: 'Users', label: 'Alumni / Community' },
  { value: 'Award', label: 'Results / Honors' },
  { value: 'ShieldCheck', label: 'Governance / Policy' },
  { value: 'Building2', label: 'Campus / Institute' },
  { value: 'Megaphone', label: 'Notices / Announcements' },
  { value: 'ExternalLink', label: 'External Link' },
] as const;

export function RenderCmsIcon({
  name,
  className = 'w-3.5 h-3.5',
}: {
  name?: string;
  className?: string;
}) {
  switch (name) {
    case 'Home':
      return <Home className={className} />;
    case 'Megaphone':
      return <Megaphone className={className} />;
    case 'Image':
      return <ImageIcon className={className} />;
    case 'BarChart3':
    case 'analytics':
      return <BarChart3 className={className} />;
    case 'ClipboardList':
    case 'how_to_reg':
      return <ClipboardList className={className} />;
    case 'Compass':
      return <Compass className={className} />;
    case 'Sparkles':
      return <Sparkles className={className} />;
    case 'Facebook':
      return <Facebook className={className} />;
    case 'Youtube':
      return <Youtube className={className} />;
    case 'Linkedin':
      return <Linkedin className={className} />;
    case 'Instagram':
      return <Instagram className={className} />;
    case 'Twitter':
      return <Twitter className={className} />;
    case 'Mail':
      return <Mail className={className} />;
    case 'Phone':
      return <Phone className={className} />;
    case 'MapPin':
      return <MapPin className={className} />;
    case 'BookOpen':
    case 'history_edu':
      return <BookOpen className={className} />;
    case 'Calendar':
    case 'calendar_month':
      return <Calendar className={className} />;
    case 'GraduationCap':
      return <GraduationCap className={className} />;
    case 'FileText':
    case 'article':
      return <FileText className={className} />;
    case 'Users':
    case 'groups':
      return <Users className={className} />;
    case 'Award':
    case 'workspace_premium':
      return <Award className={className} />;
    case 'ShieldCheck':
    case 'gavel':
      return <ShieldCheck className={className} />;
    case 'Building2':
      return <Building2 className={className} />;
    case 'ExternalLink':
    case 'arrow_right_alt':
      return <ExternalLink className={className} />;
    case 'Globe':
    default:
      return <Globe className={className} />;
  }
}
