import {
  AdmissionFormConfig,
  AcademicClass,
  CMSConfig,
  InstituteRules,
  MfsGatewayConfig,
  SmsGatewayConfig,
  Subject,
} from './types';
import { NCTB_BOARD_PRESETS } from './nctb-presets';

export const DEFAULT_CMS_CONFIG: CMSConfig = {
  schoolName: 'Aethelgard Academy',
  siteTitle: 'Aethelgard Academy ERP & Public CMS',
  motto: 'Sapientia, Virtus, Excellentia • Est. 1984',
  crestUrl:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCoUgSJB0i8cnnNuZ5XgslAKf0c9kSxR9zfluYj5-5hqwq_RUY3rgHqd5KWV3GvJikA7aM2PZtFkxjrtj6V4KkOXYBoGNo0bubmRfTO3eQB19j8NsvXoAgfqGfuRnlj4kT9_Z1FcOKgJNRCvhnE-PQ6G_Oej4Tic7nIZI25IBzoYjNFzYRA239ER-FlZPhFxfsGHuwaQqUu_1MifNH9r2Qup_cey4_34QqZczyMXZ5A',
  crestPublicId: '',
  faviconUrl: '/icon.svg',
  faviconPublicId: '',
  eiin: 'EIIN: 108234',
  boardCode: 'Board Code: 1408',
  address: '1200 Crestview Way, Highspire Campus',
  phone: '+1 (800) 412-8820',
  email: 'contact@aethelgard.edu',
  cloudinaryCloudName: '',
  cloudinaryUploadPreset: '',
  headerLayout: 'classic-centered',
  navMenuItems: [
    { id: 'nav-home', label: 'Home', href: '/', icon: 'Home', visible: true },
    {
      id: 'nav-about',
      label: 'About Us',
      href: '/about',
      icon: 'Building2',
      visible: true,
      children: [
        {
          id: 'sub-details',
          href: '/about#details',
          label: 'School Details and History',
          description: 'Institutional heritage & leadership',
          icon: 'BookOpen',
        },
        {
          id: 'sub-glance',
          href: '/about#at-a-glance',
          label: 'At a Glance',
          description: 'Live campus facts, EIIN & metrics',
          icon: 'BarChart3',
        },
        {
          id: 'sub-teachers',
          href: '/about#teachers-staff',
          label: 'Teachers & Staffs',
          description: 'Certified academic faculty directory',
          icon: 'Users',
        },
        {
          id: 'sub-smc',
          href: '/about#smc',
          label: 'School Managing Committee (SMC)',
          description: 'Board of governors & oversight',
          icon: 'ShieldCheck',
        },
      ],
    },
    {
      id: 'nav-academics',
      label: 'Academics',
      href: '/academics',
      icon: 'GraduationCap',
      visible: true,
      children: [
        {
          id: 'sub-routine',
          href: '/academics#class-routine',
          label: 'Classes Routine',
          description: 'Daily shift & grade timetable',
          icon: 'Calendar',
        },
        {
          id: 'sub-results',
          href: '/academics#exam-results',
          label: 'Examination & Results',
          description: 'NCTB grading, subjects & results',
          icon: 'Award',
        },
        {
          id: 'sub-admission',
          href: '/admissions',
          label: 'Admission',
          description: 'Online application & intake rules',
          icon: 'ClipboardList',
        },
      ],
    },
    { id: 'nav-alumni', label: 'Alumni', href: '/alumni', icon: 'Users', visible: true },
    { id: 'nav-notices', label: 'Notice', href: '/notices', icon: 'Megaphone', visible: true },
    { id: 'nav-contact', label: 'Contact', href: '/contact', icon: 'Phone', visible: true },
  ],
  showPrincipalCard: true,
  principalName: 'Head of Institution',
  principalDesignation: 'Principal',
  principalSubDesignation: '',
  principalBadge: 'Head of Institution',
  principalPhotoUrl: '',
  principalPhotoPublicId: '',
  principalQuote: 'Configure your institutional vision and principal message in Admin CMS.',
  principalNarrative:
    'Welcome to our institution. Update this institutional overview, leadership portraits, and campus highlights directly from the CMS Control Center.',
  extraLeadershipCards: [],
  isAdmissionOpen: false,
  isResultsPublished: false,
  isEmergencyAlert: false,
  emergencyAlertText: '',
  isMaintenanceMode: false,
  aboutContent:
    'Update your institution history, academic mission, and campus achievements inside Admin → Website CMS.',
  atAGlanceHighlights: [],
  smcMembers: [],
  customAboutSections: [],
  academicsContent:
    'Curriculum follows National Curriculum & Textbook Board (NCTB) guidelines across configured School and College wings.',
  academicsPageConfig: {
    heading: 'Academics, Routines & Examinations',
    showRoutine: true,
    showFourthSubjectGuide: true,
  },
  alumniPageConfig: {
    heading: 'Alumni Association',
    subtitle: 'Connecting graduated batches and verified institutional alumni.',
    showRegistrationForm: true,
    featuredAlumni: [],
  },
  contactPageConfig: {
    heading: 'Campus Helpdesk & Inquiries',
    officeHours: 'Sunday – Thursday, 08:00 AM – 04:00 PM',
    mapNote: 'Configure campus directions and office hours in Admin → Website CMS.',
    showInquiryForm: true,
  },
  footerColumns: [
    {
      id: 'fcol-important',
      title: 'Important Links',
      links: [
        { id: 'fl-1', label: 'About Institution', href: '/about#details', icon: 'BookOpen' },
        { id: 'fl-2', label: 'Classes Routine', href: '/academics#class-routine', icon: 'Calendar' },
        { id: 'fl-3', label: 'Online Admission', href: '/admissions', icon: 'GraduationCap' },
        { id: 'fl-4', label: 'Notice & Circulars', href: '/notices', icon: 'FileText' },
        { id: 'fl-5', label: 'Alumni Network', href: '/alumni', icon: 'Users' },
      ],
    },
  ],
  footerTagline: 'Academic Excellence & Transparent Digital Campus Management.',
  copyrightText: '© 2025 Institutional ERP. All rights reserved.',
  heroSlides: [],
  stats: {
    enrolledStudents: '0',
    certifiedFaculty: '0',
    alumniNetwork: '0',
  },
};

export const DEFAULT_INSTITUTE_RULES: InstituteRules = {
  enabledWings: { school: true, college: true },
  activeAcademicYear: String(new Date().getFullYear()),
  activeCollegeSession: `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`,
  hscYear1Session: `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`,
  hscYear2Session: `${new Date().getFullYear() - 1}–${new Date().getFullYear()}`,
  workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
  weekendDays: ['Friday', 'Saturday'],
  enabledShifts: ['Morning', 'Day'],
  shiftPeriodTemplates: {
    Morning: [
      { id: 'mp-1', period: '1st', startTime: '07:45 AM', endTime: '08:30 AM', label: '1st Period' },
      { id: 'mp-2', period: '2nd', startTime: '08:30 AM', endTime: '09:15 AM', label: '2nd Period' },
      { id: 'mp-3', period: '3rd', startTime: '09:15 AM', endTime: '10:00 AM', label: '3rd Period' },
      { id: 'mp-brk', period: 'Tiffin', startTime: '10:00 AM', endTime: '10:25 AM', isBreak: true, label: 'Tiffin Break' },
      { id: 'mp-4', period: '4th', startTime: '10:25 AM', endTime: '11:10 AM', label: '4th Period' },
      { id: 'mp-5', period: '5th', startTime: '11:10 AM', endTime: '11:55 AM', label: '5th Period' },
      { id: 'mp-6', period: '6th', startTime: '11:55 AM', endTime: '12:35 PM', label: '6th Period' },
    ],
    Day: [
      { id: 'dp-1', period: '1st', startTime: '12:45 PM', endTime: '01:30 PM', label: '1st Period' },
      { id: 'dp-2', period: '2nd', startTime: '01:30 PM', endTime: '02:15 PM', label: '2nd Period' },
      { id: 'dp-3', period: '3rd', startTime: '02:15 PM', endTime: '03:00 PM', label: '3rd Period' },
      { id: 'dp-brk', period: 'Tiffin', startTime: '03:00 PM', endTime: '03:20 PM', isBreak: true, label: 'Tiffin Break' },
      { id: 'dp-4', period: '4th', startTime: '03:20 PM', endTime: '04:05 PM', label: '4th Period' },
      { id: 'dp-5', period: '5th', startTime: '04:05 PM', endTime: '04:45 PM', label: '5th Period' },
      { id: 'dp-6', period: '6th', startTime: '04:45 PM', endTime: '05:25 PM', label: '6th Period' },
    ],
  },
  routineActivities: [
    { id: 'act-1', name: 'Morning Assembly & Homeroom', defaultRoom: 'Campus Ground', requiresTeacher: false },
    { id: 'act-2', name: 'Library & Guided Reading', defaultRoom: 'Central Library', requiresTeacher: true },
    { id: 'act-3', name: 'Computer Lab / ICT Practice', defaultRoom: 'ICT Lab', requiresTeacher: true },
    { id: 'act-4', name: 'Physical Education & Sports', defaultRoom: 'Sports Field', requiresTeacher: true },
    { id: 'act-5', name: 'Weekly Class Test / CT', defaultRoom: '', requiresTeacher: true },
  ],
  minAttendancePercent: 75,
  passThresholdPercent: 33,
  enableFourthSubjectBonus: true,
  componentWisePassRequired: true,
  combinePairedPapersInResult: true,
  teacherIdPrefix: 'RHHSTID',
  staffIdPrefix: 'RHHSSID',
  promotionPolicyNote:
    'Students must maintain minimum attendance and pass compulsory subjects (CQ/MCQ/Practical) for annual promotion.',
};

export const DEFAULT_ADMISSION_FORM_CONFIG: AdmissionFormConfig = {
  heading: 'Candidate Registration Form',
  instructions:
    'Complete accurate candidate details matching birth certificate and previous academic transcript records.',
  signatoryName: 'Principal',
  signatoryTitle: 'Admissions Committee',
  customFields: [],
};

export const DEFAULT_MFS_CONFIG: MfsGatewayConfig = {
  defaultMonthlyFee: 2000,
  bkash: { enabled: false, merchantNumber: '', appKey: '', mode: 'Sandbox' },
  nagad: { enabled: false, merchantNumber: '', merchantId: '', mode: 'Sandbox' },
  rocket: { enabled: false, merchantNumber: '', billerId: '', mode: 'Sandbox' },
};

export const DEFAULT_SMS_CONFIG: SmsGatewayConfig = {
  provider: 'BulkSMSBD',
  senderId: 'INSTITUTE',
  endpointUrl: '',
  apiKeyConfigured: false,
  autoResultSms: false,
  autoFeeReceiptSms: false,
};

export function buildNctbPresetSeed(rules: InstituteRules): {
  classes: AcademicClass[];
  subjects: Subject[];
} {
  const schoolEnabled = rules.enabledWings?.school !== false;
  const collegeEnabled = rules.enabledWings?.college !== false;
  const classes: AcademicClass[] = [];
  const subjects: Subject[] = [];

  if (schoolEnabled) {
    const schoolDefs: Array<{
      id: string;
      name: string;
      order: number;
      hasGroups: boolean;
      groups: AcademicClass['groups'];
      tierId: 'junior' | 'ssc';
    }> = [
      { id: 'cls-6', name: 'Class 6', order: 6, hasGroups: false, groups: ['General'], tierId: 'junior' },
      { id: 'cls-7', name: 'Class 7', order: 7, hasGroups: false, groups: ['General'], tierId: 'junior' },
      { id: 'cls-8', name: 'Class 8', order: 8, hasGroups: false, groups: ['General'], tierId: 'junior' },
      {
        id: 'cls-9',
        name: 'Class 9',
        order: 9,
        hasGroups: true,
        groups: ['Science', 'Business Studies', 'Humanities'],
        tierId: 'ssc',
      },
      {
        id: 'cls-10',
        name: 'Class 10',
        order: 10,
        hasGroups: true,
        groups: ['Science', 'Business Studies', 'Humanities'],
        tierId: 'ssc',
      },
    ];

    for (const def of schoolDefs) {
      classes.push({
        id: def.id,
        name: def.name,
        order: def.order,
        cycleType: 'Academic Year',
        activeCycle: rules.activeAcademicYear || '2025',
        hasSections: true,
        hasGroups: def.hasGroups,
        sectionMode: 'shared',
        shifts: ['Morning', 'Day'],
        sections: ['A', 'B'],
        groups: def.groups,
      });
      const tier = NCTB_BOARD_PRESETS.find((t) => t.id === def.tierId);
      if (tier) {
        for (const sub of tier.subjects) {
          subjects.push({
            ...sub,
            id: `sub-${def.order}-${sub.code.toLowerCase()}`,
            classLevel: def.name,
          });
        }
      }
    }
  }

  if (collegeEnabled) {
    const hscDefs = [
      {
        id: 'cls-11',
        name: 'Class 11',
        order: 11,
        cycle: rules.hscYear1Session || rules.activeCollegeSession || '2025–2026',
      },
      {
        id: 'cls-12',
        name: 'Class 12',
        order: 12,
        cycle: rules.hscYear2Session || rules.activeCollegeSession || '2024–2025',
      },
    ];
    const hscTier = NCTB_BOARD_PRESETS.find((t) => t.id === 'hsc');
    for (const def of hscDefs) {
      classes.push({
        id: def.id,
        name: def.name,
        order: def.order,
        cycleType: 'Academic Session',
        activeCycle: def.cycle,
        hasSections: true,
        hasGroups: true,
        sectionMode: 'shared',
        shifts: ['Morning', 'Day'],
        sections: ['A'],
        groups: ['Science', 'Business Studies', 'Humanities'],
      });
      if (hscTier) {
        for (const sub of hscTier.subjects) {
          subjects.push({
            ...sub,
            id: `sub-${def.order}-${sub.code.toLowerCase()}`,
            classLevel: def.name,
          });
        }
      }
    }
  }

  return { classes, subjects };
}
