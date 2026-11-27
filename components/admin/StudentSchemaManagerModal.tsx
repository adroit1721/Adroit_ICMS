'use client';

import { useState } from 'react';
import {
  InstituteRules,
  StudentCoreFieldKey,
  StudentFieldRequirement,
  StudentSchemaConfig,
} from '@/lib/types';
import {
  DEFAULT_STUDENT_SCHEMA_CONFIG,
  STUDENT_SCHEMA_FIELDS,
  formatStudentSystemId,
  getEffectiveStudentSchema,
} from '@/lib/student-schema';
import {
  X,
  Check,
  RotateCcw,
  Lock,
  Sliders,
  Asterisk,
  Eye,
  EyeOff,
  Hash,
} from 'lucide-react';

interface StudentSchemaManagerModalProps {
  rules: InstituteRules;
  onSave: (updates: Partial<InstituteRules>) => void;
  onClose: () => void;
}

const SECTION_TITLES: Record<string, { title: string; subtitle: string }> = {
  photo: {
    title: 'Photo Upload',
    subtitle: 'Passport 35:45 aspect ratio photo cropping rules',
  },
  academic: {
    title: 'Academic Information',
    subtitle: 'Enrollment metadata, ID format, rolls, and SMS contacts',
  },
  personal: {
    title: 'Personal Information',
    subtitle: 'Student demographics, birth registration, and blood group',
  },
  parents: {
    title: 'Parents Information',
    subtitle: 'Father and Mother names, NIDs, phones, and professions',
  },
  address: {
    title: 'Address Information',
    subtitle: 'Bangladesh 8 Divisions -> 64 Districts -> Upazilas cascading directory',
  },
};

export default function StudentSchemaManagerModal({
  rules,
  onSave,
  onClose,
}: StudentSchemaManagerModalProps) {
  const effective = getEffectiveStudentSchema(rules);
  const [fields, setFields] = useState<Record<string, StudentFieldRequirement>>({
    ...effective.fields,
  });
  const [prefixInput, setPrefixInput] = useState(rules.studentIdPrefix || 'AG');
  const [activeSection, setActiveSection] = useState<string>('all');

  const setFieldReq = (key: StudentCoreFieldKey, req: StudentFieldRequirement) => {
    setFields((prev) => ({
      ...prev,
      [key]: req,
    }));
  };

  const handleResetDefaults = () => {
    setFields({ ...DEFAULT_STUDENT_SCHEMA_CONFIG.fields });
    setPrefixInput('AG');
  };

  const handleSave = () => {
    const updatedSchema: StudentSchemaConfig = {
      fields: { ...fields },
      customFields: effective.customFields || [],
    };
    onSave({
      studentSchemaConfig: updatedSchema,
      studentIdPrefix: prefixInput.replace(/[\s-]/g, '').trim().toUpperCase() || 'AG',
    });
    onClose();
  };

  const sections = ['all', 'photo', 'academic', 'personal', 'parents', 'address'];

  const filteredFields = STUDENT_SCHEMA_FIELDS.filter((f) =>
    activeSection === 'all' ? true : f.section === activeSection
  );

  const sampleId = formatStudentSystemId(
    prefixInput,
    rules.activeAcademicYear || new Date().getFullYear(),
    1
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">
                Student Data Format &amp; Mandatory Controls
              </h2>
              <p className="text-xs text-on-surface-variant">
                Configure field requirements (*), custom student ID prefix, and export/import sync
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prefix & System ID Settings */}
        <div className="p-5 border-b border-outline-variant/20 bg-surface-container-lowest grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Student ID Prefix
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Hash className="w-4 h-4 text-on-surface-variant absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={prefixInput}
                  onChange={(e) => setPrefixInput(e.target.value.replace(/[\s-]/g, '').toUpperCase())}
                  placeholder="e.g. AG, BHS, DPS"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1">
              Used when auto-generating student IDs if left blank during admission.
            </p>
          </div>

          <div className="rounded-xl p-3 bg-surface-container-low border border-outline-variant/20 flex flex-col justify-center">
            <span className="text-xs text-on-surface-variant font-medium">Generated ID Preview</span>
            <span className="text-base font-mono font-bold text-primary mt-0.5">{sampleId}</span>
            <span className="text-[11px] text-on-surface-variant/70">
              Format: [PREFIX][YEAR][4-DIGIT-SEQUENCE] (No hyphens or spaces)
            </span>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="px-6 py-2 border-b border-outline-variant/15 flex items-center gap-2 overflow-x-auto bg-surface-container-lowest">
          {sections.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setActiveSection(sec)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeSection === sec
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              {sec === 'all'
                ? 'All Fields'
                : SECTION_TITLES[sec]?.title || sec}
            </button>
          ))}
        </div>

        {/* Fields List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 divide-y divide-outline-variant/10">
          {filteredFields.map((field) => {
            const currentReq: StudentFieldRequirement =
              field.lockedRequired ? 'required' : (fields[field.key] || field.defaultRequirement);

            return (
              <div
                key={field.key}
                className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-on-surface">
                      {field.label}
                    </span>
                    {field.lockedRequired && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                        <Lock className="w-3 h-3" /> System Mandatory
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-on-surface-variant">
                    CSV / Excel Header: <code className="font-mono text-primary">{field.csvHeader}</code>
                  </span>
                </div>

                {/* Requirement Selector */}
                <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant/20 self-start sm:self-auto">
                  <button
                    type="button"
                    disabled={field.lockedRequired}
                    onClick={() => setFieldReq(field.key, 'required')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      currentReq === 'required'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    } ${field.lockedRequired ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                  >
                    <Asterisk className="w-3.5 h-3.5" />
                    Mandatory (*)
                  </button>

                  <button
                    type="button"
                    disabled={field.lockedRequired}
                    onClick={() => setFieldReq(field.key, 'optional')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      currentReq === 'optional'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    } ${field.lockedRequired ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Optional
                  </button>

                  <button
                    type="button"
                    disabled={field.lockedRequired}
                    onClick={() => setFieldReq(field.key, 'hidden')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      currentReq === 'hidden'
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    } ${field.lockedRequired ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Hidden
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-container-low/50">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Reset to Defaults
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-bold shadow-sm cursor-pointer transition-colors"
            >
              <Check className="w-4 h-4" /> Save Schema &amp; Controls
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
