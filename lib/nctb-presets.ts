import { AcademicGroup, Subject, SubjectGenderRestriction } from './types';

export type NctbPresetTierId = 'primary' | 'junior' | 'ssc' | 'hsc';

export interface NctbPresetTier {
  id: NctbPresetTierId;
  label: string;
  subtitle: string;
  subjects: Array<Omit<Subject, 'id' | 'classLevel'>>;
}

const makeSub = (
  code: string,
  name: string,
  banglaName: string,
  group: AcademicGroup,
  cqFull: number,
  cqPass: number,
  mcqFull: number,
  mcqPass: number,
  pracFull: number,
  pracPass: number,
  opts?: {
    applicableGroups?: AcademicGroup[];
    isCompulsory?: boolean;
    canBeFourthSubject?: boolean;
    religionRestriction?: Subject['religionRestriction'];
    genderRestriction?: SubjectGenderRestriction;
    combinedPaperKey?: string;
    combinedPaperTitle?: string;
    paperNumber?: 1 | 2;
    excludeFromGpa?: boolean;
  }
): Omit<Subject, 'id' | 'classLevel'> => ({
  code,
  name,
  banglaName,
  group,
  applicableGroups: opts?.applicableGroups ?? [group],
  isCompulsory: opts?.isCompulsory ?? true,
  canBeFourthSubject: opts?.canBeFourthSubject ?? false,
  religionRestriction: opts?.religionRestriction ?? null,
  genderRestriction: opts?.genderRestriction ?? 'All',
  combinedPaperKey: opts?.combinedPaperKey,
  combinedPaperTitle: opts?.combinedPaperTitle,
  paperNumber: opts?.paperNumber,
  excludeFromGpa: opts?.excludeFromGpa ?? false,
  components: {
    cq: { fullMarks: cqFull, passMarks: cqPass },
    mcq: { fullMarks: mcqFull, passMarks: mcqPass },
    practical: { fullMarks: pracFull, passMarks: pracPass },
  },
  totalFullMarks: cqFull + mcqFull + pracFull,
  totalPassMarks: cqPass + mcqPass + pracPass,
});

export const NCTB_BOARD_PRESETS: NctbPresetTier[] = [
  {
    id: 'primary',
    label: 'Primary (Class 1–5)',
    subtitle: 'NCTB Primary Bangla, English, Math, BGS, Science, Religion & Co-Curricular Assessment',
    subjects: [
      makeSub('P-101', 'Amar Bangla Boi', 'আমার বাংলা বই', 'General', 100, 33, 0, 0, 0, 0),
      makeSub('P-102', 'English for Today', 'ইংরেজি', 'General', 100, 33, 0, 0, 0, 0),
      makeSub('P-103', 'Primary Mathematics', 'প্রাথমিক গণিত', 'General', 100, 33, 0, 0, 0, 0),
      makeSub('P-104', 'Bangladesh & Global Studies', 'বাংলাদেশ ও বিশ্বপরিচয়', 'General', 100, 33, 0, 0, 0, 0),
      makeSub('P-105', 'Elementary Science', 'প্রাথমিক বিজ্ঞান', 'General', 100, 33, 0, 0, 0, 0),
      makeSub('P-111', 'Islam & Moral Education', 'ইসলাম ও নৈতিক শিক্ষা', 'General', 100, 33, 0, 0, 0, 0, {
        religionRestriction: 'Islam',
      }),
      makeSub('P-112', 'Hinduism & Moral Education', 'হিন্দুধর্ম ও নৈতিক শিক্ষা', 'General', 100, 33, 0, 0, 0, 0, {
        religionRestriction: 'Hinduism',
      }),
      makeSub('P-113', 'Buddhism & Moral Education', 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা', 'General', 100, 33, 0, 0, 0, 0, {
        religionRestriction: 'Buddhism',
      }),
      makeSub('P-114', 'Christianity & Moral Education', 'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', 'General', 100, 33, 0, 0, 0, 0, {
        religionRestriction: 'Christianity',
      }),
      makeSub('P-120', 'Arts, Drawing & Handwriting', 'চারু ও কারুকলা / হাতের লেখা', 'General', 50, 17, 0, 0, 0, 0, {
        excludeFromGpa: true,
      }),
    ],
  },
  {
    id: 'junior',
    label: 'Junior Secondary (Class 6–8)',
    subtitle: 'NCTB Junior Secondary Bangla (1st+2nd), English (1st+2nd), Math, Science, BGS, ICT & Optional Work',
    subjects: [
      makeSub('J-101', 'Bangla 1st Paper', 'বাংলা ১ম পত্র', 'General', 70, 23, 30, 10, 0, 0, {
        combinedPaperKey: 'bangla',
        combinedPaperTitle: 'Bangla (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('J-102', 'Bangla 2nd Paper', 'বাংলা ২য় পত্র', 'General', 35, 12, 15, 5, 0, 0, {
        combinedPaperKey: 'bangla',
        combinedPaperTitle: 'Bangla (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('J-107', 'English 1st Paper', 'ইংরেজি ১ম পত্র', 'General', 100, 33, 0, 0, 0, 0, {
        combinedPaperKey: 'english',
        combinedPaperTitle: 'English (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('J-108', 'English 2nd Paper', 'ইংরেজি ২য় পত্র', 'General', 50, 17, 0, 0, 0, 0, {
        combinedPaperKey: 'english',
        combinedPaperTitle: 'English (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('J-109', 'Mathematics', 'গণিত', 'General', 70, 23, 30, 10, 0, 0),
      makeSub('J-127', 'Science', 'বিজ্ঞান', 'General', 70, 23, 30, 10, 0, 0),
      makeSub('J-150', 'Bangladesh & Global Studies', 'বাংলাদেশ ও বিশ্বপরিচয়', 'General', 70, 23, 30, 10, 0, 0),
      makeSub('J-154', 'Information & Communication Technology', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'General', 25, 8, 25, 8, 0, 0),
      makeSub('J-111', 'Islam & Moral Education', 'ইসলাম ও নৈতিক শিক্ষা', 'General', 70, 23, 30, 10, 0, 0, {
        religionRestriction: 'Islam',
      }),
      makeSub('J-112', 'Hinduism & Moral Education', 'হিন্দুধর্ম ও নৈতিক শিক্ষা', 'General', 70, 23, 30, 10, 0, 0, {
        religionRestriction: 'Hinduism',
      }),
      makeSub('J-113', 'Buddhism & Moral Education', 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা', 'General', 70, 23, 30, 10, 0, 0, {
        religionRestriction: 'Buddhism',
      }),
      makeSub('J-114', 'Christianity & Moral Education', 'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', 'General', 70, 23, 30, 10, 0, 0, {
        religionRestriction: 'Christianity',
      }),
      makeSub('J-134', 'Agriculture Studies', 'কৃষিশিক্ষা', 'General', 50, 17, 25, 8, 25, 8, {
        isCompulsory: false,
        canBeFourthSubject: true,
      }),
      makeSub('J-151', 'Home Science (Female Only)', 'গার্হস্থ্য বিজ্ঞান', 'General', 50, 17, 25, 8, 25, 8, {
        isCompulsory: false,
        canBeFourthSubject: true,
        genderRestriction: 'Female',
      }),
      makeSub('J-147', 'Physical Education & Health', 'শারীরিক শিক্ষা ও স্বাস্থ্য', 'General', 30, 10, 0, 0, 20, 7, {
        excludeFromGpa: true,
      }),
    ],
  },
  {
    id: 'ssc',
    label: 'Secondary / SSC (Class 9–10)',
    subtitle: 'Official Bangladesh Education Board SSC Codes: Paired Bangla/English, Multi-Group 127 & 134, Female-Only 151',
    subjects: [
      // Common / General Track (Compulsory for ALL Groups)
      makeSub('101', 'Bangla 1st Paper', 'বাংলা ১ম পত্র', 'General', 70, 23, 30, 10, 0, 0, {
        combinedPaperKey: 'bangla',
        combinedPaperTitle: 'Bangla (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('102', 'Bangla 2nd Paper', 'বাংলা ২য় পত্র', 'General', 70, 23, 30, 10, 0, 0, {
        combinedPaperKey: 'bangla',
        combinedPaperTitle: 'Bangla (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('107', 'English 1st Paper', 'ইংরেজি ১ম পত্র', 'General', 100, 33, 0, 0, 0, 0, {
        combinedPaperKey: 'english',
        combinedPaperTitle: 'English (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('108', 'English 2nd Paper', 'ইংরেজি ২য় পত্র', 'General', 100, 33, 0, 0, 0, 0, {
        combinedPaperKey: 'english',
        combinedPaperTitle: 'English (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('109', 'Mathematics', 'গণিত', 'General', 70, 23, 30, 10, 0, 0),
      makeSub('154', 'Information & Communication Technology', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'General', 0, 0, 25, 8, 25, 8),
      makeSub('111', 'Islam & Moral Education', 'ইসলাম ও নৈতিক শিক্ষা', 'General', 70, 23, 30, 10, 0, 0, {
        religionRestriction: 'Islam',
      }),
      makeSub('112', 'Hinduism & Moral Education', 'হিন্দুধর্ম ও নৈতিক শিক্ষা', 'General', 70, 23, 30, 10, 0, 0, {
        religionRestriction: 'Hinduism',
      }),
      makeSub('113', 'Buddhism & Moral Education', 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা', 'General', 70, 23, 30, 10, 0, 0, {
        religionRestriction: 'Buddhism',
      }),
      makeSub('114', 'Christianity & Moral Education', 'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', 'General', 70, 23, 30, 10, 0, 0, {
        religionRestriction: 'Christianity',
      }),
      // Science Group Compulsory + Elective/4th Pool
      makeSub('136', 'Physics', 'পদার্থবিজ্ঞান', 'Science', 50, 17, 25, 8, 25, 8),
      makeSub('137', 'Chemistry', 'রসায়ন', 'Science', 50, 17, 25, 8, 25, 8),
      makeSub('150', 'Bangladesh & Global Studies', 'বাংলাদেশ ও বিশ্বপরিচয়', 'Science', 70, 23, 30, 10, 0, 0),
      makeSub('138', 'Biology', 'জীববিজ্ঞান', 'Science', 50, 17, 25, 8, 25, 8, {
        isCompulsory: false,
        canBeFourthSubject: true,
      }),
      makeSub('126', 'Higher Mathematics', 'উচ্চতর গণিত', 'Science', 50, 17, 25, 8, 25, 8, {
        isCompulsory: false,
        canBeFourthSubject: true,
      }),
      // Business Studies + Humanities Shared Core (Unified 127)
      makeSub('127', 'General Science', 'সাধারণ বিজ্ঞান', 'Business Studies', 70, 23, 30, 10, 0, 0, {
        applicableGroups: ['Business Studies', 'Humanities'],
        isCompulsory: true,
      }),
      // Business Studies Core
      makeSub('146', 'Accounting', 'হিসাববিজ্ঞান', 'Business Studies', 70, 23, 30, 10, 0, 0),
      makeSub('143', 'Business Entrepreneurship', 'ব্যবসায় উদ্যোগ', 'Business Studies', 70, 23, 30, 10, 0, 0),
      makeSub('152', 'Finance & Banking', 'ফিন্যান্স ও ব্যাংকিং', 'Business Studies', 70, 23, 30, 10, 0, 0),
      // Humanities Elective Pool (Pick Main Electives + 4th per NCTB standard)
      makeSub('153', 'History of Bangladesh & World Civilization', 'বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
      }),
      makeSub('110', 'Geography & Environment', 'ভূগোল ও পরিবেশ', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
      }),
      makeSub('140', 'Civics & Citizenship', 'পৌরনীতি ও নাগরিকতা', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
      }),
      makeSub('141', 'Economics', 'অর্থনীতি', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
      }),
      // Cross-Group Optional / 4th Pool (Science + Business Studies + Humanities)
      makeSub('134', 'Agriculture Studies', 'কৃষিশিক্ষা', 'Science', 50, 17, 25, 8, 25, 8, {
        applicableGroups: ['Science', 'Business Studies', 'Humanities'],
        isCompulsory: false,
        canBeFourthSubject: true,
        genderRestriction: 'All',
      }),
      makeSub('151', 'Home Science (Female Only)', 'গার্হস্থ্য বিজ্ঞান', 'Humanities', 50, 17, 25, 8, 25, 8, {
        applicableGroups: ['Science', 'Business Studies', 'Humanities'],
        isCompulsory: false,
        canBeFourthSubject: true,
        genderRestriction: 'Female',
      }),
    ],
  },
  {
    id: 'hsc',
    label: 'Higher Secondary / HSC (Class 11–12)',
    subtitle: 'Official Bangladesh Education Board HSC Paired 1st+2nd Papers, ICT 275 & Cross-Group 239/273',
    subjects: [
      // General / Compulsory across all HSC tracks
      makeSub('101', 'Bangla 1st Paper', 'বাংলা ১ম পত্র', 'General', 70, 23, 30, 10, 0, 0, {
        combinedPaperKey: 'bangla',
        combinedPaperTitle: 'Bangla (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('102', 'Bangla 2nd Paper', 'বাংলা ২য় পত্র', 'General', 100, 33, 0, 0, 0, 0, {
        combinedPaperKey: 'bangla',
        combinedPaperTitle: 'Bangla (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('107', 'English 1st Paper', 'ইংরেজি ১ম পত্র', 'General', 100, 33, 0, 0, 0, 0, {
        combinedPaperKey: 'english',
        combinedPaperTitle: 'English (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('108', 'English 2nd Paper', 'ইংরেজি ২য় পত্র', 'General', 100, 33, 0, 0, 0, 0, {
        combinedPaperKey: 'english',
        combinedPaperTitle: 'English (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('275', 'Information & Communication Technology', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'General', 50, 17, 25, 8, 25, 8),
      // HSC Science (1st + 2nd Paired)
      makeSub('174', 'Physics 1st Paper', 'পদার্থবিজ্ঞান ১ম পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        combinedPaperKey: 'hsc-physics',
        combinedPaperTitle: 'Physics (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('175', 'Physics 2nd Paper', 'পদার্থবিজ্ঞান ২য় পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        combinedPaperKey: 'hsc-physics',
        combinedPaperTitle: 'Physics (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('176', 'Chemistry 1st Paper', 'রসায়ন ১ম পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        combinedPaperKey: 'hsc-chemistry',
        combinedPaperTitle: 'Chemistry (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('177', 'Chemistry 2nd Paper', 'রসায়ন ২য় পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        combinedPaperKey: 'hsc-chemistry',
        combinedPaperTitle: 'Chemistry (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('265', 'Higher Mathematics 1st Paper', 'উচ্চতর গণিত ১ম পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-higher-math',
        combinedPaperTitle: 'Higher Mathematics (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('266', 'Higher Mathematics 2nd Paper', 'উচ্চতর গণিত ২য় পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-higher-math',
        combinedPaperTitle: 'Higher Mathematics (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('178', 'Biology 1st Paper', 'জীববিজ্ঞান ১ম পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-biology',
        combinedPaperTitle: 'Biology (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('179', 'Biology 2nd Paper', 'জীববিজ্ঞান ২য় পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-biology',
        combinedPaperTitle: 'Biology (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      // HSC Business Studies
      makeSub('253', 'Accounting 1st Paper', 'হিসাববিজ্ঞান ১ম পত্র', 'Business Studies', 70, 23, 30, 10, 0, 0, {
        combinedPaperKey: 'hsc-accounting',
        combinedPaperTitle: 'Accounting (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('254', 'Accounting 2nd Paper', 'হিসাববিজ্ঞান ২য় পত্র', 'Business Studies', 70, 23, 30, 10, 0, 0, {
        combinedPaperKey: 'hsc-accounting',
        combinedPaperTitle: 'Accounting (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('277', 'Business Organization & Management 1st Paper', 'ব্যবসায় সংগঠন ও ব্যবস্থাপনা ১ম পত্র', 'Business Studies', 70, 23, 30, 10, 0, 0, {
        combinedPaperKey: 'hsc-bom',
        combinedPaperTitle: 'Business Org. & Management (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('278', 'Business Organization & Management 2nd Paper', 'ব্যবসায় সংগঠন ও ব্যবস্থাপনা ২য় পত্র', 'Business Studies', 70, 23, 30, 10, 0, 0, {
        combinedPaperKey: 'hsc-bom',
        combinedPaperTitle: 'Business Org. & Management (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('292', 'Finance, Banking & Insurance 1st Paper', 'ফিন্যান্স, ব্যাংকিং ও বিমা ১ম পত্র', 'Business Studies', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-finance',
        combinedPaperTitle: 'Finance, Banking & Insurance (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('293', 'Finance, Banking & Insurance 2nd Paper', 'ফিন্যান্স, ব্যাংকিং ও বিমা ২য় পত্র', 'Business Studies', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-finance',
        combinedPaperTitle: 'Finance, Banking & Insurance (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('286', 'Production Management & Marketing 1st Paper', 'উৎপাদন ব্যবস্থাপনা ও বিপণন ১ম পত্র', 'Business Studies', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-marketing',
        combinedPaperTitle: 'Production Mgmt. & Marketing (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('287', 'Production Management & Marketing 2nd Paper', 'উৎপাদন ব্যবস্থাপনা ও বিপণন ২য় পত্র', 'Business Studies', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-marketing',
        combinedPaperTitle: 'Production Mgmt. & Marketing (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      // HSC Humanities
      makeSub('121', 'Logic 1st Paper', 'যুক্তিবিদ্যা ১ম পত্র', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-logic',
        combinedPaperTitle: 'Logic (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('122', 'Logic 2nd Paper', 'যুক্তিবিদ্যা ২য় পত্র', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-logic',
        combinedPaperTitle: 'Logic (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('269', 'Civics & Good Governance 1st Paper', 'পৌরনীতি ও সুশাসন ১ম পত্র', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-civics',
        combinedPaperTitle: 'Civics & Good Governance (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('270', 'Civics & Good Governance 2nd Paper', 'পৌরনীতি ও সুশাসন ২য় পত্র', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-civics',
        combinedPaperTitle: 'Civics & Good Governance (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('109', 'Economics 1st Paper', 'অর্থনীতি ১ম পত্র', 'Humanities', 70, 23, 30, 10, 0, 0, {
        applicableGroups: ['Humanities', 'Business Studies'],
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-economics',
        combinedPaperTitle: 'Economics (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('110', 'Economics 2nd Paper', 'অর্থনীতি ২য় পত্র', 'Humanities', 70, 23, 30, 10, 0, 0, {
        applicableGroups: ['Humanities', 'Business Studies'],
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-economics',
        combinedPaperTitle: 'Economics (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('267', 'Islamic History & Culture 1st Paper', 'ইসলামের ইতিহাস ও সংস্কৃতি ১ম পত্র', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-islamic-history',
        combinedPaperTitle: 'Islamic History & Culture (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('268', 'Islamic History & Culture 2nd Paper', 'ইসলামের ইতিহাস ও সংস্কৃতি ২য় পত্র', 'Humanities', 70, 23, 30, 10, 0, 0, {
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-islamic-history',
        combinedPaperTitle: 'Islamic History & Culture (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      // HSC Cross-Group Elective / 4th Pool (239/240 Agri & 273/274 Home Science)
      makeSub('239', 'Agriculture Studies 1st Paper', 'কৃষিশিক্ষা ১ম পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        applicableGroups: ['Science', 'Business Studies', 'Humanities'],
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-agriculture',
        combinedPaperTitle: 'Agriculture Studies (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('240', 'Agriculture Studies 2nd Paper', 'কৃষিশিক্ষা ২য় পত্র', 'Science', 50, 17, 25, 8, 25, 8, {
        applicableGroups: ['Science', 'Business Studies', 'Humanities'],
        isCompulsory: false,
        canBeFourthSubject: true,
        combinedPaperKey: 'hsc-agriculture',
        combinedPaperTitle: 'Agriculture Studies (1st & 2nd Combined)',
        paperNumber: 2,
      }),
      makeSub('273', 'Home Science 1st Paper (Female Only)', 'গার্হস্থ্য বিজ্ঞান ১ম পত্র', 'Humanities', 50, 17, 25, 8, 25, 8, {
        applicableGroups: ['Science', 'Business Studies', 'Humanities'],
        isCompulsory: false,
        canBeFourthSubject: true,
        genderRestriction: 'Female',
        combinedPaperKey: 'hsc-home-science',
        combinedPaperTitle: 'Home Science (1st & 2nd Combined)',
        paperNumber: 1,
      }),
      makeSub('274', 'Home Science 2nd Paper (Female Only)', 'গার্হস্থ্য বিজ্ঞান ২য় পত্র', 'Humanities', 50, 17, 25, 8, 25, 8, {
        applicableGroups: ['Science', 'Business Studies', 'Humanities'],
        isCompulsory: false,
        canBeFourthSubject: true,
        genderRestriction: 'Female',
        combinedPaperKey: 'hsc-home-science',
        combinedPaperTitle: 'Home Science (1st & 2nd Combined)',
        paperNumber: 2,
      }),
    ],
  },
];

