/**
 * Drug and Electrolyte ECG Pattern Detection
 *
 * Detects ECG patterns associated with:
 * - Electrolyte imbalances (K+, Ca++, Mg++)
 * - Drug effects (digoxin, antiarrhythmics, beta blockers)
 * - Drug toxicity
 *
 * Clinical Reference:
 * - Hyperkalemia: Peaked T → Widened QRS → Sine wave → Asystole
 * - Hypokalemia: Flattened T → U waves → ST depression
 * - Hypercalcemia: Shortened QT
 * - Hypocalcemia: Prolonged QT
 * - Digoxin: Scooped ST, shortened QT, regularized AF
 *
 * @module signal/loader/png-digitizer/signal/drug-electrolyte
 */

import type { ECGSignal, LeadName } from '../../../../types';

// ============================================================================
// Types
// ============================================================================

export type ElectrolyteType = 'potassium' | 'calcium' | 'magnesium';
export type PotassiumLevel = 'severe_hyperkalemia' | 'moderate_hyperkalemia' | 'mild_hyperkalemia' |
  'normal' | 'mild_hypokalemia' | 'moderate_hypokalemia' | 'severe_hypokalemia';
export type CalciumLevel = 'hypercalcemia' | 'normal' | 'hypocalcemia';
export type MagnesiumLevel = 'hypermagnesemia' | 'normal' | 'hypomagnesemia';

export type DrugClass =
  | 'digitalis'
  | 'class_ia_antiarrhythmic'  // quinidine, procainamide, disopyramide
  | 'class_ib_antiarrhythmic'  // lidocaine, mexiletine
  | 'class_ic_antiarrhythmic'  // flecainide, propafenone
  | 'class_iii_antiarrhythmic' // amiodarone, sotalol, dofetilide
  | 'beta_blocker'
  | 'calcium_channel_blocker'
  | 'tricyclic_antidepressant'
  | 'phenothiazine'
  | 'fluoroquinolone'
  | 'macrolide';

export interface ElectrolytePattern {
  electrolyte: ElectrolyteType;
  level: PotassiumLevel | CalciumLevel | MagnesiumLevel;
  confidence: number;
  severity: 'critical' | 'moderate' | 'mild';
  features: ElectrolyteFeature[];
  estimatedLevel?: {
    min: number;
    max: number;
    unit: string;
  };
  clinicalNotes: string[];
}

export interface ElectrolyteFeature {
  type: ElectrolyteFeatureType;
  present: boolean;
  confidence: number;
  leadEvidence: LeadName[];
  measurement?: number;
  unit?: string;
}

export type ElectrolyteFeatureType =
  | 'peaked_t_waves'
  | 'flattened_t_waves'
  | 'tall_t_waves'
  | 'widened_qrs'
  | 'prolonged_pr'
  | 'absent_p_waves'
  | 'sine_wave_pattern'
  | 'u_waves'
  | 'prominent_u_waves'
  | 'st_depression'
  | 'shortened_qt'
  | 'prolonged_qt'
  | 'osborn_waves';  // Also seen in hypothermia

export interface DrugEffectPattern {
  drugClass: DrugClass;
  effectType: 'therapeutic' | 'toxicity' | 'side_effect';
  confidence: number;
  severity: 'critical' | 'moderate' | 'mild';
  features: DrugFeature[];
  specificDrug?: string;
  clinicalNotes: string[];
}

export interface DrugFeature {
  type: DrugFeatureType;
  present: boolean;
  confidence: number;
  leadEvidence: LeadName[];
  measurement?: number;
  unit?: string;
}

export type DrugFeatureType =
  | 'scooped_st'           // Digoxin "reverse check mark"
  | 'shortened_qt'
  | 'prolonged_qt'
  | 'widened_qrs'
  | 'prolonged_pr'
  | 'regularized_af'       // Digoxin effect on AF
  | 'av_block'
  | 'bradycardia'
  | 'bidirectional_vt'     // Digoxin toxicity
  | 'accelerated_junctional'  // Digoxin toxicity
  | 'pvcs'
  | 'atrial_tachycardia'   // With block - digoxin toxicity
  | 't_wave_flattening'
  | 'u_wave_prominence';

export interface DrugElectrolyteResult {
  electrolytePatterns: ElectrolytePattern[];
  drugPatterns: DrugEffectPattern[];
  combinedEffects: CombinedEffect[];
  overallRisk: 'critical' | 'high' | 'moderate' | 'low';
  recommendations: string[];
  timestamp: Date;
}

export interface CombinedEffect {
  description: string;
  components: string[];
  risk: 'critical' | 'high' | 'moderate';
  mechanism: string;
}

export interface DetectorOptions {
  /** Heart rate for QT correction */
  heartRate?: number;
  /** Include borderline findings */
  includeBorderline?: boolean;
  /** Known medications for context */
  knownMedications?: string[];
  /** Prior potassium level if available */
  priorPotassium?: number;
}

// ============================================================================
// Drug/Electrolyte Pattern Detector
// ============================================================================

export class DrugElectrolyteDetector {
  private sampleRate: number;
  private options: Required<DetectorOptions>;

  constructor(sampleRate: number, options: DetectorOptions = {}) {
    this.sampleRate = sampleRate;
    this.options = {
      heartRate: options.heartRate ?? 75,
      includeBorderline: options.includeBorderline ?? true,
      knownMedications: options.knownMedications ?? [],
      priorPotassium: options.priorPotassium ?? 0,
    };
  }

  /**
   * Analyze ECG for drug and electrolyte effects
   */
  analyze(signal: ECGSignal): DrugElectrolyteResult {
    const electrolytePatterns: ElectrolytePattern[] = [];
    const drugPatterns: DrugEffectPattern[] = [];

    // Detect potassium abnormalities
    const potassiumPattern = this.detectPotassiumAbnormality(signal);
    if (potassiumPattern) {
      electrolytePatterns.push(potassiumPattern);
    }

    // Detect calcium abnormalities
    const calciumPattern = this.detectCalciumAbnormality(signal);
    if (calciumPattern) {
      electrolytePatterns.push(calciumPattern);
    }

    // Detect magnesium abnormalities
    const magnesiumPattern = this.detectMagnesiumAbnormality(signal);
    if (magnesiumPattern) {
      electrolytePatterns.push(magnesiumPattern);
    }

    // Detect digoxin effects
    const digoxinPattern = this.detectDigoxinEffect(signal);
    if (digoxinPattern) {
      drugPatterns.push(digoxinPattern);
    }

    // Detect QT-prolonging drug effects
    const qtDrugPattern = this.detectQTProlongingDrugs(signal);
    if (qtDrugPattern) {
      drugPatterns.push(qtDrugPattern);
    }

    // Detect Class IC antiarrhythmic effects
    const classICPattern = this.detectClassICEffect(signal);
    if (classICPattern) {
      drugPatterns.push(classICPattern);
    }

    // Detect TCA effects
    const tcaPattern = this.detectTCAEffect(signal);
    if (tcaPattern) {
      drugPatterns.push(tcaPattern);
    }

    // Detect combined/synergistic effects
    const combinedEffects = this.detectCombinedEffects(electrolytePatterns, drugPatterns);

    // Determine overall risk
    const overallRisk = this.calculateOverallRisk(electrolytePatterns, drugPatterns, combinedEffects);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      electrolytePatterns,
      drugPatterns,
      combinedEffects,
      overallRisk
    );

    return {
      electrolytePatterns,
      drugPatterns,
      combinedEffects,
      overallRisk,
      recommendations,
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Potassium Detection
  // ============================================================================

  private detectPotassiumAbnormality(signal: ECGSignal): ElectrolytePattern | null {
    const features: ElectrolyteFeature[] = [];

    // Check for peaked T waves (hyperkalemia)
    const peakedT = this.detectPeakedTWaves(signal);
    features.push(peakedT);

    // Check for flattened T waves (hypokalemia)
    const flatT = this.detectFlattenedTWaves(signal);
    features.push(flatT);

    // Check for widened QRS (severe hyperkalemia)
    const wideQRS = this.detectWidenedQRS(signal);
    features.push(wideQRS);

    // Check for U waves (hypokalemia)
    const uWaves = this.detectUWaves(signal);
    features.push(uWaves);

    // Check for prolonged PR (hyperkalemia)
    const prolongedPR = this.detectProlongedPR(signal);
    features.push(prolongedPR);

    // Check for sine wave pattern (critical hyperkalemia)
    const sineWave = this.detectSineWavePattern(signal);
    features.push(sineWave);

    // Determine level based on feature combination
    const level = this.classifyPotassiumLevel(features);
    if (level === 'normal') return null;

    const isHyperkalemia = level.includes('hyperkalemia');
    const severity = this.getPotassiumSeverity(level);

    const estimatedLevel = this.estimatePotassiumLevel(level);

    const clinicalNotes: string[] = [];
    if (isHyperkalemia) {
      if (severity === 'critical') {
        clinicalNotes.push('ECG consistent with critical hyperkalemia - immediate treatment needed');
        clinicalNotes.push('Consider IV calcium gluconate, insulin/glucose, and potassium-lowering agents');
      } else if (severity === 'moderate') {
        clinicalNotes.push('ECG suggests moderate hyperkalemia');
        clinicalNotes.push('Recommend urgent potassium level check');
      }
    } else {
      if (severity === 'critical' || severity === 'moderate') {
        clinicalNotes.push('ECG suggests hypokalemia with arrhythmia risk');
        clinicalNotes.push('Recommend potassium and magnesium supplementation');
      }
    }

    return {
      electrolyte: 'potassium',
      level,
      confidence: this.calculateFeatureConfidence(features),
      severity,
      features: features.filter(f => f.present),
      estimatedLevel,
      clinicalNotes,
    };
  }

  private detectPeakedTWaves(signal: ECGSignal): ElectrolyteFeature {
    const precordialLeads: LeadName[] = ['V2', 'V3', 'V4'];
    const leadEvidence: LeadName[] = [];
    let totalPeakedness = 0;
    let count = 0;

    for (const leadName of precordialLeads) {
      const leadData = signal.leads[leadName];
      if (!leadData) continue;

      // Find T waves and assess morphology
      const tWaves = this.findTWaves(leadData);
      for (const tWave of tWaves) {
        const peakedness = this.measureTWavePeakedness(leadData, tWave);
        if (peakedness > 0.7) {
          leadEvidence.push(leadName);
        }
        totalPeakedness += peakedness;
        count++;
      }
    }

    const avgPeakedness = count > 0 ? totalPeakedness / count : 0;
    const present = avgPeakedness > 0.6 && leadEvidence.length >= 2;

    return {
      type: 'peaked_t_waves',
      present,
      confidence: present ? Math.min(0.95, avgPeakedness) : 0.1,
      leadEvidence,
      measurement: avgPeakedness,
    };
  }

  private detectFlattenedTWaves(signal: ECGSignal): ElectrolyteFeature {
    const limbleads: LeadName[] = ['I', 'II', 'aVL', 'aVF', 'V5', 'V6'];
    const leadEvidence: LeadName[] = [];
    let totalFlatness = 0;
    let count = 0;

    for (const leadName of limbleads) {
      const leadData = signal.leads[leadName];
      if (!leadData) continue;

      const tWaves = this.findTWaves(leadData);
      for (const tWave of tWaves) {
        const amplitude = this.measureTWaveAmplitude(leadData, tWave);
        const rAmplitude = this.measureRWaveAmplitude(leadData);

        // T wave should be at least 1/10 of R wave normally
        if (rAmplitude > 0) {
          const ratio = amplitude / rAmplitude;
          if (ratio < 0.1) {
            leadEvidence.push(leadName);
            totalFlatness += 1 - ratio * 10;
          }
          count++;
        }
      }
    }

    const avgFlatness = count > 0 ? totalFlatness / count : 0;
    const present = avgFlatness > 0.5 && leadEvidence.length >= 2;

    return {
      type: 'flattened_t_waves',
      present,
      confidence: present ? Math.min(0.9, avgFlatness) : 0.1,
      leadEvidence,
    };
  }

  private detectWidenedQRS(signal: ECGSignal): ElectrolyteFeature {
    const leadData = signal.leads.II || signal.leads.V5;
    if (!leadData) {
      return { type: 'widened_qrs', present: false, confidence: 0.1, leadEvidence: [] };
    }

    const qrsWidth = this.measureQRSWidth(leadData);
    const qrsWidthMs = (qrsWidth / this.sampleRate) * 1000;

    // Normal QRS < 120ms, wide > 120ms, very wide > 160ms
    const isWide = qrsWidthMs > 120;
    const isVeryWide = qrsWidthMs > 160;

    const leadEvidence: LeadName[] = [];
    if (isWide) {
      // Check multiple leads
      for (const leadName of Object.keys(signal.leads) as LeadName[]) {
        const lead = signal.leads[leadName];
        if (lead) {
          const width = this.measureQRSWidth(lead);
          if ((width / this.sampleRate) * 1000 > 120) {
            leadEvidence.push(leadName);
          }
        }
      }
    }

    return {
      type: 'widened_qrs',
      present: isWide,
      confidence: isVeryWide ? 0.95 : isWide ? 0.8 : 0.1,
      leadEvidence,
      measurement: qrsWidthMs,
      unit: 'ms',
    };
  }

  private detectUWaves(signal: ECGSignal): ElectrolyteFeature {
    const precordialLeads: LeadName[] = ['V2', 'V3', 'V4'];
    const leadEvidence: LeadName[] = [];
    let uWaveCount = 0;

    for (const leadName of precordialLeads) {
      const leadData = signal.leads[leadName];
      if (!leadData) continue;

      const hasUWave = this.detectUWaveInLead(leadData);
      if (hasUWave) {
        leadEvidence.push(leadName);
        uWaveCount++;
      }
    }

    const present = uWaveCount >= 2;

    return {
      type: 'u_waves',
      present,
      confidence: present ? 0.75 + (uWaveCount * 0.05) : 0.1,
      leadEvidence,
    };
  }

  private detectProlongedPR(signal: ECGSignal): ElectrolyteFeature {
    const leadData = signal.leads.II;
    if (!leadData) {
      return { type: 'prolonged_pr', present: false, confidence: 0.1, leadEvidence: [] };
    }

    const prInterval = this.measurePRInterval(leadData);
    const prMs = (prInterval / this.sampleRate) * 1000;

    // Normal PR 120-200ms, prolonged > 200ms
    const isProlonged = prMs > 200;
    const isVeryProlonged = prMs > 280;

    return {
      type: 'prolonged_pr',
      present: isProlonged,
      confidence: isVeryProlonged ? 0.9 : isProlonged ? 0.75 : 0.1,
      leadEvidence: isProlonged ? ['II'] : [],
      measurement: prMs,
      unit: 'ms',
    };
  }

  private detectSineWavePattern(signal: ECGSignal): ElectrolyteFeature {
    const leadData = signal.leads.II || signal.leads.V2;
    if (!leadData) {
      return { type: 'sine_wave_pattern', present: false, confidence: 0.1, leadEvidence: [] };
    }

    // Sine wave pattern: loss of distinct P, QRS, T - smooth undulating pattern
    const distinctness = this.measureWaveformDistinctness(leadData);
    const isSineWave = distinctness < 0.3;

    return {
      type: 'sine_wave_pattern',
      present: isSineWave,
      confidence: isSineWave ? 0.95 : 0.1,
      leadEvidence: isSineWave ? ['II', 'V2'] : [],
    };
  }

  private classifyPotassiumLevel(features: ElectrolyteFeature[]): PotassiumLevel {
    const peaked = features.find(f => f.type === 'peaked_t_waves')?.present;
    const wide = features.find(f => f.type === 'widened_qrs')?.present;
    const sine = features.find(f => f.type === 'sine_wave_pattern')?.present;
    const flat = features.find(f => f.type === 'flattened_t_waves')?.present;
    const uWaves = features.find(f => f.type === 'u_waves')?.present;
    const prolongedPR = features.find(f => f.type === 'prolonged_pr')?.present;

    // Hyperkalemia progression
    if (sine) return 'severe_hyperkalemia';
    if (wide && peaked) return 'severe_hyperkalemia';
    if (wide && prolongedPR) return 'moderate_hyperkalemia';
    if (peaked && prolongedPR) return 'moderate_hyperkalemia';
    if (peaked) return 'mild_hyperkalemia';

    // Hypokalemia
    if (flat && uWaves) return 'moderate_hypokalemia';
    if (uWaves) return 'mild_hypokalemia';
    if (flat) return 'mild_hypokalemia';

    return 'normal';
  }

  private getPotassiumSeverity(level: PotassiumLevel): 'critical' | 'moderate' | 'mild' {
    switch (level) {
      case 'severe_hyperkalemia':
      case 'severe_hypokalemia':
        return 'critical';
      case 'moderate_hyperkalemia':
      case 'moderate_hypokalemia':
        return 'moderate';
      default:
        return 'mild';
    }
  }

  private estimatePotassiumLevel(level: PotassiumLevel): { min: number; max: number; unit: string } {
    // Approximate K+ levels based on ECG patterns
    switch (level) {
      case 'severe_hyperkalemia':
        return { min: 7.0, max: 9.0, unit: 'mEq/L' };
      case 'moderate_hyperkalemia':
        return { min: 6.0, max: 7.0, unit: 'mEq/L' };
      case 'mild_hyperkalemia':
        return { min: 5.5, max: 6.0, unit: 'mEq/L' };
      case 'mild_hypokalemia':
        return { min: 3.0, max: 3.5, unit: 'mEq/L' };
      case 'moderate_hypokalemia':
        return { min: 2.5, max: 3.0, unit: 'mEq/L' };
      case 'severe_hypokalemia':
        return { min: 2.0, max: 2.5, unit: 'mEq/L' };
      default:
        return { min: 3.5, max: 5.0, unit: 'mEq/L' };
    }
  }

  // ============================================================================
  // Calcium Detection
  // ============================================================================

  private detectCalciumAbnormality(signal: ECGSignal): ElectrolytePattern | null {
    const features: ElectrolyteFeature[] = [];

    // QT interval is the primary marker for calcium abnormalities
    const qtFeature = this.detectQTForCalcium(signal);
    features.push(qtFeature);

    if (!qtFeature.present) return null;

    const qtMs = qtFeature.measurement || 0;
    const qtc = this.calculateQTc(qtMs, this.options.heartRate);

    let level: CalciumLevel = 'normal';
    if (qtc < 340) {
      level = 'hypercalcemia';
    } else if (qtc > 460) {
      level = 'hypocalcemia';
    }

    if (level === 'normal') return null;

    const severity: 'critical' | 'moderate' | 'mild' =
      qtc < 300 || qtc > 500 ? 'critical' :
        qtc < 320 || qtc > 480 ? 'moderate' : 'mild';

    const clinicalNotes: string[] = [];
    if (level === 'hypercalcemia') {
      clinicalNotes.push(`Shortened QTc (${qtc.toFixed(0)}ms) suggests hypercalcemia`);
      clinicalNotes.push('Consider checking calcium, PTH, and malignancy workup');
    } else {
      clinicalNotes.push(`Prolonged QTc (${qtc.toFixed(0)}ms) may indicate hypocalcemia`);
      clinicalNotes.push('Note: Other causes of QT prolongation should be excluded');
    }

    return {
      electrolyte: 'calcium',
      level,
      confidence: qtFeature.confidence * 0.8, // Lower confidence - QT affected by many factors
      severity,
      features: [qtFeature],
      clinicalNotes,
    };
  }

  private detectQTForCalcium(signal: ECGSignal): ElectrolyteFeature {
    const leadData = signal.leads.II || signal.leads.V5;
    if (!leadData) {
      return { type: 'shortened_qt', present: false, confidence: 0.1, leadEvidence: [] };
    }

    const qtInterval = this.measureQTInterval(leadData);
    const qtMs = (qtInterval / this.sampleRate) * 1000;
    const qtc = this.calculateQTc(qtMs, this.options.heartRate);

    const isShort = qtc < 360;
    const isLong = qtc > 450;

    return {
      type: isShort ? 'shortened_qt' : 'prolonged_qt',
      present: isShort || isLong,
      confidence: (isShort || isLong) ? 0.8 : 0.1,
      leadEvidence: (isShort || isLong) ? ['II', 'V5'] : [],
      measurement: qtc,
      unit: 'ms (QTc)',
    };
  }

  // ============================================================================
  // Magnesium Detection
  // ============================================================================

  private detectMagnesiumAbnormality(signal: ECGSignal): ElectrolytePattern | null {
    // Magnesium abnormalities have overlapping features with K+ and Ca++
    // Hypomagnesemia: prolonged QT, U waves, torsades risk
    // Hypermagnesemia: prolonged PR, bradycardia, wide QRS (rare)

    const features: ElectrolyteFeature[] = [];

    const uWaves = this.detectUWaves(signal);
    const prolongedQT = this.detectProlongedQT(signal);

    // Hypomagnesemia often accompanies hypokalemia
    if (uWaves.present && prolongedQT.present) {
      features.push(uWaves);
      features.push(prolongedQT);

      return {
        electrolyte: 'magnesium',
        level: 'hypomagnesemia',
        confidence: 0.5, // Low confidence - need K+ context
        severity: 'moderate',
        features,
        clinicalNotes: [
          'ECG pattern may indicate hypomagnesemia (often with hypokalemia)',
          'Consider checking both magnesium and potassium levels',
          'Magnesium repletion may be needed before potassium can normalize',
        ],
      };
    }

    return null;
  }

  private detectProlongedQT(signal: ECGSignal): ElectrolyteFeature {
    const leadData = signal.leads.II || signal.leads.V5;
    if (!leadData) {
      return { type: 'prolonged_qt', present: false, confidence: 0.1, leadEvidence: [] };
    }

    const qtInterval = this.measureQTInterval(leadData);
    const qtMs = (qtInterval / this.sampleRate) * 1000;
    const qtc = this.calculateQTc(qtMs, this.options.heartRate);

    const isProlonged = qtc > 460;
    const isSevereProlonged = qtc > 500;

    return {
      type: 'prolonged_qt',
      present: isProlonged,
      confidence: isSevereProlonged ? 0.95 : isProlonged ? 0.8 : 0.1,
      leadEvidence: isProlonged ? ['II', 'V5'] : [],
      measurement: qtc,
      unit: 'ms (QTc)',
    };
  }

  // ============================================================================
  // Drug Effect Detection
  // ============================================================================

  private detectDigoxinEffect(signal: ECGSignal): DrugEffectPattern | null {
    const features: DrugFeature[] = [];

    // Scooped ST segments (Salvador Dali mustache / reverse checkmark)
    const scoopedST = this.detectScoopedST(signal);
    features.push(scoopedST);

    // Shortened QT
    const shortQT = this.detectShortenedQT(signal);
    features.push(shortQT);

    // Regularized AF (digoxin effect)
    const regularizedAF = this.detectRegularizedAF(signal);
    features.push(regularizedAF);

    // Bradycardia
    const brady = this.detectBradycardia(signal);
    features.push(brady);

    // Toxicity markers
    const bidirectionalVT = this.detectBidirectionalVT(signal);
    features.push(bidirectionalVT);

    const acceleratedJunctional = this.detectAcceleratedJunctional(signal);
    features.push(acceleratedJunctional);

    const atWithBlock = this.detectATWithBlock(signal);
    features.push(atWithBlock);

    // Determine if therapeutic or toxic
    const therapeuticFeatures = [scoopedST, shortQT].filter(f => f.present).length;
    const toxicFeatures = [bidirectionalVT, acceleratedJunctional, atWithBlock].filter(f => f.present).length;

    if (therapeuticFeatures === 0 && toxicFeatures === 0) return null;

    const effectType: 'therapeutic' | 'toxicity' = toxicFeatures > 0 ? 'toxicity' : 'therapeutic';
    const severity: 'critical' | 'moderate' | 'mild' =
      toxicFeatures >= 2 ? 'critical' :
        toxicFeatures === 1 ? 'moderate' : 'mild';

    const clinicalNotes: string[] = [];
    if (effectType === 'toxicity') {
      clinicalNotes.push('ECG findings suggestive of digoxin toxicity');
      clinicalNotes.push('URGENT: Check digoxin level and hold medication');
      clinicalNotes.push('Consider digoxin-specific Fab antibody fragments if severe');
    } else {
      clinicalNotes.push('Scooped ST segments consistent with digoxin effect');
      clinicalNotes.push('This is a therapeutic effect, not necessarily toxicity');
    }

    return {
      drugClass: 'digitalis',
      effectType,
      confidence: this.calculateDrugFeatureConfidence(features),
      severity,
      features: features.filter(f => f.present),
      specificDrug: 'digoxin',
      clinicalNotes,
    };
  }

  private detectScoopedST(signal: ECGSignal): DrugFeature {
    const inferolateral: LeadName[] = ['I', 'II', 'aVL', 'aVF', 'V5', 'V6'];
    const leadEvidence: LeadName[] = [];
    let scoopCount = 0;

    for (const leadName of inferolateral) {
      const leadData = signal.leads[leadName];
      if (!leadData) continue;

      if (this.hasScoopedSTMorphology(leadData)) {
        leadEvidence.push(leadName);
        scoopCount++;
      }
    }

    const present = scoopCount >= 3;

    return {
      type: 'scooped_st',
      present,
      confidence: present ? 0.8 + (scoopCount * 0.03) : 0.1,
      leadEvidence,
    };
  }

  private detectShortenedQT(signal: ECGSignal): DrugFeature {
    const leadData = signal.leads.II || signal.leads.V5;
    if (!leadData) {
      return { type: 'shortened_qt', present: false, confidence: 0.1, leadEvidence: [] };
    }

    const qtInterval = this.measureQTInterval(leadData);
    const qtMs = (qtInterval / this.sampleRate) * 1000;
    const qtc = this.calculateQTc(qtMs, this.options.heartRate);

    const isShort = qtc < 360;

    return {
      type: 'shortened_qt',
      present: isShort,
      confidence: isShort ? 0.75 : 0.1,
      leadEvidence: isShort ? ['II', 'V5'] : [],
      measurement: qtc,
      unit: 'ms (QTc)',
    };
  }

  private detectRegularizedAF(_signal: ECGSignal): DrugFeature {
    // Digoxin can make AF look more regular (junctional escape rhythm)
    // This is a complex detection - simplified here
    return {
      type: 'regularized_af',
      present: false,
      confidence: 0.1,
      leadEvidence: [],
    };
  }

  private detectBradycardia(_signal: ECGSignal): DrugFeature {
    const hr = this.options.heartRate;
    const isBrady = hr < 60;
    const isSevereBrady = hr < 50;

    return {
      type: 'bradycardia',
      present: isBrady,
      confidence: isSevereBrady ? 0.9 : isBrady ? 0.75 : 0.1,
      leadEvidence: isBrady ? ['II'] : [],
      measurement: hr,
      unit: 'bpm',
    };
  }

  private detectBidirectionalVT(_signal: ECGSignal): DrugFeature {
    // Alternating QRS axis - pathognomonic for digoxin toxicity
    // Simplified detection
    return {
      type: 'bidirectional_vt',
      present: false,
      confidence: 0.1,
      leadEvidence: [],
    };
  }

  private detectAcceleratedJunctional(_signal: ECGSignal): DrugFeature {
    // Junctional rhythm at 70-130 bpm without P waves
    return {
      type: 'accelerated_junctional',
      present: false,
      confidence: 0.1,
      leadEvidence: [],
    };
  }

  private detectATWithBlock(_signal: ECGSignal): DrugFeature {
    // Atrial tachycardia with AV block - classic digoxin toxicity
    return {
      type: 'atrial_tachycardia',
      present: false,
      confidence: 0.1,
      leadEvidence: [],
    };
  }

  // ============================================================================
  // QT-Prolonging Drug Detection
  // ============================================================================

  private detectQTProlongingDrugs(signal: ECGSignal): DrugEffectPattern | null {
    const qtFeature = this.detectProlongedQT(signal);

    if (!qtFeature.present) return null;

    const qtc = qtFeature.measurement || 0;
    const severity: 'critical' | 'moderate' | 'mild' =
      qtc > 500 ? 'critical' :
        qtc > 480 ? 'moderate' : 'mild';

    // Check known medications for context
    const possibleDrugs: DrugClass[] = [];
    const knownMeds = this.options.knownMedications.map(m => m.toLowerCase());

    if (knownMeds.some(m => ['amiodarone', 'sotalol', 'dofetilide', 'ibutilide'].includes(m))) {
      possibleDrugs.push('class_iii_antiarrhythmic');
    }
    if (knownMeds.some(m => ['azithromycin', 'clarithromycin', 'erythromycin'].includes(m))) {
      possibleDrugs.push('macrolide');
    }
    if (knownMeds.some(m => ['ciprofloxacin', 'levofloxacin', 'moxifloxacin'].includes(m))) {
      possibleDrugs.push('fluoroquinolone');
    }
    if (knownMeds.some(m => ['haloperidol', 'chlorpromazine', 'thioridazine'].includes(m))) {
      possibleDrugs.push('phenothiazine');
    }

    const drugClass = possibleDrugs.length > 0 ? possibleDrugs[0] : 'class_iii_antiarrhythmic';

    const clinicalNotes: string[] = [];
    clinicalNotes.push(`Prolonged QTc (${qtc.toFixed(0)}ms) detected`);

    if (qtc > 500) {
      clinicalNotes.push('HIGH RISK for Torsades de Pointes');
      clinicalNotes.push('Consider discontinuing QT-prolonging medications');
      clinicalNotes.push('Correct electrolytes (K+ > 4.0, Mg++ > 2.0)');
    } else if (qtc > 480) {
      clinicalNotes.push('Moderate TdP risk - monitor closely');
    }

    return {
      drugClass,
      effectType: severity === 'critical' ? 'toxicity' : 'side_effect',
      confidence: 0.7,
      severity,
      features: [qtFeature as DrugFeature],
      clinicalNotes,
    };
  }

  // ============================================================================
  // Class IC Antiarrhythmic Detection
  // ============================================================================

  private detectClassICEffect(signal: ECGSignal): DrugEffectPattern | null {
    const wideQRS = this.detectWidenedQRS(signal);
    const prolongedPR = this.detectProlongedPR(signal);

    if (!wideQRS.present && !prolongedPR.present) return null;

    // Class IC drugs (flecainide, propafenone) widen QRS in dose-dependent manner
    const qrsWidth = (wideQRS.measurement as number) || 0;

    const severity: 'critical' | 'moderate' | 'mild' =
      qrsWidth > 160 ? 'critical' :
        qrsWidth > 140 ? 'moderate' : 'mild';

    const clinicalNotes: string[] = [];
    clinicalNotes.push(`QRS width ${qrsWidth.toFixed(0)}ms may indicate Class IC effect`);

    if (severity === 'critical') {
      clinicalNotes.push('Wide QRS concerning for toxicity');
      clinicalNotes.push('Consider sodium bicarbonate for Class IC toxicity');
    }

    return {
      drugClass: 'class_ic_antiarrhythmic',
      effectType: severity === 'critical' ? 'toxicity' : 'therapeutic',
      confidence: 0.6, // Lower confidence without drug history
      severity,
      features: [wideQRS as DrugFeature, prolongedPR as DrugFeature].filter(f => f.present),
      clinicalNotes,
    };
  }

  // ============================================================================
  // TCA Detection
  // ============================================================================

  private detectTCAEffect(signal: ECGSignal): DrugEffectPattern | null {
    const wideQRS = this.detectWidenedQRS(signal);
    const prolongedQT = this.detectProlongedQT(signal);

    if (!wideQRS.present) return null;

    const qrsWidth = (wideQRS.measurement as number) || 0;

    // TCA toxicity: Wide QRS, prolonged QT, right axis deviation, terminal R in aVR
    const terminalRAVR = this.detectTerminalRAVR(signal);

    const features = [wideQRS as DrugFeature, prolongedQT as DrugFeature, terminalRAVR].filter(f => f.present);

    if (features.length < 2) return null;

    const severity: 'critical' | 'moderate' | 'mild' =
      qrsWidth > 160 || terminalRAVR.present ? 'critical' :
        qrsWidth > 140 ? 'moderate' : 'mild';

    const clinicalNotes: string[] = [];
    clinicalNotes.push('ECG pattern may indicate tricyclic antidepressant effect/toxicity');

    if (terminalRAVR.present) {
      clinicalNotes.push('Terminal R wave in aVR is concerning for TCA toxicity');
    }
    if (severity === 'critical') {
      clinicalNotes.push('URGENT: Consider sodium bicarbonate for TCA toxicity');
      clinicalNotes.push('Target arterial pH 7.50-7.55');
    }

    return {
      drugClass: 'tricyclic_antidepressant',
      effectType: 'toxicity',
      confidence: terminalRAVR.present ? 0.85 : 0.6,
      severity,
      features,
      clinicalNotes,
    };
  }

  private detectTerminalRAVR(signal: ECGSignal): DrugFeature {
    const aVR = signal.leads.aVR;
    if (!aVR) {
      return { type: 'widened_qrs', present: false, confidence: 0.1, leadEvidence: [] };
    }

    // Look for terminal R wave > 3mm in aVR
    const hasTerminalR = this.hasTerminalRInAVR(aVR);

    return {
      type: 'widened_qrs', // Using as proxy
      present: hasTerminalR,
      confidence: hasTerminalR ? 0.85 : 0.1,
      leadEvidence: hasTerminalR ? ['aVR'] : [],
    };
  }

  // ============================================================================
  // Combined Effects Detection
  // ============================================================================

  private detectCombinedEffects(
    electrolytes: ElectrolytePattern[],
    drugs: DrugEffectPattern[]
  ): CombinedEffect[] {
    const effects: CombinedEffect[] = [];

    // Digoxin + Hypokalemia = increased toxicity risk
    const hasDigoxin = drugs.some(d => d.drugClass === 'digitalis');
    const hasHypoK = electrolytes.some(e =>
      e.electrolyte === 'potassium' && (e.level as string).includes('hypokalemia')
    );

    if (hasDigoxin && hasHypoK) {
      effects.push({
        description: 'Digoxin with hypokalemia - increased toxicity risk',
        components: ['Digoxin', 'Hypokalemia'],
        risk: 'critical',
        mechanism: 'Hypokalemia increases digoxin binding to Na/K-ATPase, enhancing toxicity',
      });
    }

    // QT-prolonging drug + Hypokalemia/Hypomagnesemia = TdP risk
    const hasQTDrug = drugs.some(d =>
      ['class_iii_antiarrhythmic', 'macrolide', 'fluoroquinolone', 'phenothiazine'].includes(d.drugClass)
    );
    const hasLowMg = electrolytes.some(e =>
      e.electrolyte === 'magnesium' && e.level === 'hypomagnesemia'
    );

    if (hasQTDrug && (hasHypoK || hasLowMg)) {
      effects.push({
        description: 'QT-prolonging drug with electrolyte abnormality - TdP risk',
        components: ['QT-prolonging medication', hasHypoK ? 'Hypokalemia' : 'Hypomagnesemia'],
        risk: 'critical',
        mechanism: 'Electrolyte abnormalities lower arrhythmia threshold in prolonged QT',
      });
    }

    // Multiple QT-prolonging drugs
    const qtDrugs = drugs.filter(d =>
      ['class_iii_antiarrhythmic', 'macrolide', 'fluoroquinolone', 'phenothiazine', 'tricyclic_antidepressant'].includes(d.drugClass)
    );

    if (qtDrugs.length >= 2) {
      effects.push({
        description: 'Multiple QT-prolonging drugs detected',
        components: qtDrugs.map(d => d.drugClass),
        risk: 'high',
        mechanism: 'Additive QT prolongation effect increases TdP risk',
      });
    }

    return effects;
  }

  // ============================================================================
  // Risk and Recommendations
  // ============================================================================

  private calculateOverallRisk(
    electrolytes: ElectrolytePattern[],
    drugs: DrugEffectPattern[],
    combined: CombinedEffect[]
  ): 'critical' | 'high' | 'moderate' | 'low' {
    // Any critical finding = critical overall
    if (electrolytes.some(e => e.severity === 'critical')) return 'critical';
    if (drugs.some(d => d.severity === 'critical')) return 'critical';
    if (combined.some(c => c.risk === 'critical')) return 'critical';

    // High risk
    if (electrolytes.some(e => e.severity === 'moderate')) return 'high';
    if (drugs.some(d => d.severity === 'moderate')) return 'high';
    if (combined.length > 0) return 'high';

    // Moderate
    if (electrolytes.length > 0 || drugs.length > 0) return 'moderate';

    return 'low';
  }

  private generateRecommendations(
    electrolytes: ElectrolytePattern[],
    drugs: DrugEffectPattern[],
    combined: CombinedEffect[],
    risk: string
  ): string[] {
    const recommendations: string[] = [];

    if (risk === 'critical') {
      recommendations.push('URGENT: Immediate clinical evaluation required');
    }

    // Electrolyte-specific recommendations
    for (const e of electrolytes) {
      if (e.electrolyte === 'potassium') {
        recommendations.push('Check serum potassium level STAT');
        if ((e.level as string).includes('hyper')) {
          recommendations.push('Consider IV calcium gluconate for cardioprotection');
          recommendations.push('Evaluate need for urgent dialysis');
        } else {
          recommendations.push('Replete potassium (IV if severe, oral if mild)');
          recommendations.push('Check magnesium and replete if low');
        }
      }
      if (e.electrolyte === 'calcium') {
        recommendations.push('Check serum calcium and ionized calcium');
      }
    }

    // Drug-specific recommendations
    for (const d of drugs) {
      if (d.drugClass === 'digitalis' && d.effectType === 'toxicity') {
        recommendations.push('Check digoxin level and hold medication');
        recommendations.push('Monitor for arrhythmias on telemetry');
      }
      if (d.effectType === 'toxicity') {
        recommendations.push(`Review ${d.drugClass.replace(/_/g, ' ')} dosing`);
      }
    }

    // Combined effect recommendations
    if (combined.length > 0) {
      recommendations.push('Review medication list for drug-drug and drug-electrolyte interactions');
    }

    // General for prolonged QT
    if (drugs.some(d => d.features.some(f => f.type === 'prolonged_qt' && f.present))) {
      recommendations.push('Maintain K+ > 4.0 mEq/L and Mg++ > 2.0 mg/dL');
      recommendations.push('Avoid additional QT-prolonging medications');
    }

    return recommendations;
  }

  // ============================================================================
  // Helper Methods - Waveform Analysis
  // ============================================================================

  private findTWaves(leadData: number[]): Array<{ start: number; peak: number; end: number }> {
    const tWaves: Array<{ start: number; peak: number; end: number }> = [];

    // Find R peaks first, then look for T waves after
    const rPeaks = this.findRPeaks(leadData);

    for (const rPeak of rPeaks) {
      // T wave is typically 200-400ms after R peak
      const searchStart = rPeak + Math.round(this.sampleRate * 0.2);
      const searchEnd = Math.min(leadData.length, rPeak + Math.round(this.sampleRate * 0.4));

      if (searchEnd <= searchStart) continue;

      // Find local maximum in T wave region
      let maxIdx = searchStart;
      let maxVal = leadData[searchStart];

      for (let i = searchStart; i < searchEnd; i++) {
        if (leadData[i] > maxVal) {
          maxVal = leadData[i];
          maxIdx = i;
        }
      }

      tWaves.push({
        start: searchStart,
        peak: maxIdx,
        end: searchEnd,
      });
    }

    return tWaves;
  }

  private findRPeaks(leadData: number[]): number[] {
    const peaks: number[] = [];
    const minDistance = Math.round(this.sampleRate * 0.4); // 400ms minimum RR

    // Simple peak detection
    for (let i = 10; i < leadData.length - 10; i++) {
      if (leadData[i] > leadData[i - 1] &&
        leadData[i] > leadData[i + 1] &&
        leadData[i] > leadData[i - 5] &&
        leadData[i] > leadData[i + 5]) {
        // Check minimum distance from last peak
        if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
          peaks.push(i);
        }
      }
    }

    return peaks;
  }

  private measureTWavePeakedness(leadData: number[], tWave: { start: number; peak: number; end: number }): number {
    const peak = leadData[tWave.peak];
    const base = (leadData[tWave.start] + leadData[tWave.end]) / 2;
    const amplitude = peak - base;

    // Calculate width at half amplitude
    const halfAmp = base + amplitude / 2;
    let leftHalf = tWave.start;
    let rightHalf = tWave.end;

    for (let i = tWave.start; i < tWave.peak; i++) {
      if (leadData[i] >= halfAmp) {
        leftHalf = i;
        break;
      }
    }

    for (let i = tWave.end; i > tWave.peak; i--) {
      if (leadData[i] >= halfAmp) {
        rightHalf = i;
        break;
      }
    }

    const widthAtHalf = rightHalf - leftHalf;
    const fullWidth = tWave.end - tWave.start;

    // Peaked T has narrow width relative to amplitude
    // Normal ratio ~0.5, peaked < 0.3
    const peakRatio = 1 - (widthAtHalf / fullWidth);

    return Math.min(1, Math.max(0, peakRatio));
  }

  private measureTWaveAmplitude(leadData: number[], tWave: { start: number; peak: number; end: number }): number {
    const peak = leadData[tWave.peak];
    const base = (leadData[tWave.start] + leadData[tWave.end]) / 2;
    return Math.abs(peak - base);
  }

  private measureRWaveAmplitude(leadData: number[]): number {
    const rPeaks = this.findRPeaks(leadData);
    if (rPeaks.length === 0) return 0;

    let totalAmp = 0;
    for (const peak of rPeaks) {
      // Find baseline (S wave or before QRS)
      const baseStart = Math.max(0, peak - Math.round(this.sampleRate * 0.04));
      const baseline = leadData[baseStart];
      totalAmp += Math.abs(leadData[peak] - baseline);
    }

    return totalAmp / rPeaks.length;
  }

  private measureQRSWidth(leadData: number[]): number {
    const rPeaks = this.findRPeaks(leadData);
    if (rPeaks.length === 0) return 0;

    // Find QRS boundaries around first R peak
    const rPeak = rPeaks[0];
    const searchRange = Math.round(this.sampleRate * 0.1); // 100ms

    // Find Q onset (where derivative becomes steep)
    let qStart = rPeak;
    for (let i = rPeak; i > rPeak - searchRange && i > 0; i--) {
      const slope = Math.abs(leadData[i] - leadData[i - 1]);
      if (slope < 10) { // Baseline reached
        qStart = i;
        break;
      }
    }

    // Find S end
    let sEnd = rPeak;
    for (let i = rPeak; i < rPeak + searchRange && i < leadData.length - 1; i++) {
      const slope = Math.abs(leadData[i + 1] - leadData[i]);
      if (slope < 10) {
        sEnd = i;
        break;
      }
    }

    return sEnd - qStart;
  }

  private measurePRInterval(leadData: number[]): number {
    // Simplified - look for P wave before QRS
    const rPeaks = this.findRPeaks(leadData);
    if (rPeaks.length === 0) return 0;

    const rPeak = rPeaks[0];
    const searchStart = Math.max(0, rPeak - Math.round(this.sampleRate * 0.3));

    // Look for P wave bump before QRS
    let pPeak = searchStart;
    let maxVal = leadData[searchStart];

    for (let i = searchStart; i < rPeak - Math.round(this.sampleRate * 0.04); i++) {
      if (leadData[i] > maxVal && leadData[i] > leadData[i - 3] && leadData[i] > leadData[i + 3]) {
        maxVal = leadData[i];
        pPeak = i;
      }
    }

    // Find QRS onset
    let qStart = rPeak;
    for (let i = rPeak; i > pPeak && i > 0; i--) {
      const slope = Math.abs(leadData[i] - leadData[i - 1]);
      if (slope < 10) {
        qStart = i;
        break;
      }
    }

    return qStart - pPeak;
  }

  private measureQTInterval(leadData: number[]): number {
    const rPeaks = this.findRPeaks(leadData);
    if (rPeaks.length === 0) return 0;

    const rPeak = rPeaks[0];

    // Find QRS onset
    const searchRange = Math.round(this.sampleRate * 0.05);
    let qStart = rPeak;
    for (let i = rPeak; i > rPeak - searchRange && i > 0; i--) {
      const slope = Math.abs(leadData[i] - leadData[i - 1]);
      if (slope < 10) {
        qStart = i;
        break;
      }
    }

    // Find T wave end (where it returns to baseline)
    const tSearchEnd = rPeak + Math.round(this.sampleRate * 0.5);
    let tEnd = rPeak;
    const baseline = leadData[qStart];

    for (let i = rPeak + Math.round(this.sampleRate * 0.3); i < tSearchEnd && i < leadData.length - 1; i++) {
      if (Math.abs(leadData[i] - baseline) < 20 && Math.abs(leadData[i + 1] - baseline) < 20) {
        tEnd = i;
        break;
      }
    }

    if (tEnd === rPeak) {
      tEnd = Math.min(leadData.length - 1, rPeak + Math.round(this.sampleRate * 0.4));
    }

    return tEnd - qStart;
  }

  private calculateQTc(qtMs: number, heartRate: number): number {
    // Bazett formula: QTc = QT / sqrt(RR)
    const rrSec = 60 / heartRate;
    return qtMs / Math.sqrt(rrSec);
  }

  private detectUWaveInLead(leadData: number[]): boolean {
    // U wave appears after T wave, before next P wave
    const tWaves = this.findTWaves(leadData);
    if (tWaves.length === 0) return false;

    const tEnd = tWaves[0].end;
    const searchEnd = Math.min(leadData.length, tEnd + Math.round(this.sampleRate * 0.2));

    // Look for a small bump after T wave
    let hasUWave = false;
    const baseline = leadData[tEnd];

    for (let i = tEnd + 5; i < searchEnd - 5; i++) {
      const isLocalMax = leadData[i] > leadData[i - 3] && leadData[i] > leadData[i + 3];
      const amplitude = leadData[i] - baseline;

      if (isLocalMax && amplitude > 20 && amplitude < 200) {
        hasUWave = true;
        break;
      }
    }

    return hasUWave;
  }

  private measureWaveformDistinctness(leadData: number[]): number {
    // Measure how distinct P, QRS, T waves are
    // Sine wave pattern has low distinctness
    const rPeaks = this.findRPeaks(leadData);
    if (rPeaks.length < 2) return 1;

    // Calculate RR interval variance
    const rrIntervals: number[] = [];
    for (let i = 1; i < rPeaks.length; i++) {
      rrIntervals.push(rPeaks[i] - rPeaks[i - 1]);
    }

    const meanRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const variance = rrIntervals.reduce((sum, rr) => sum + Math.pow(rr - meanRR, 2), 0) / rrIntervals.length;

    // High variance = distinct waveforms, low variance could be sine wave
    const distinctness = Math.min(1, Math.sqrt(variance) / 50);

    return distinctness;
  }

  private hasScoopedSTMorphology(leadData: number[]): boolean {
    const rPeaks = this.findRPeaks(leadData);
    if (rPeaks.length === 0) return false;

    const rPeak = rPeaks[0];

    // Look at ST segment (40-120ms after J point)
    const stStart = rPeak + Math.round(this.sampleRate * 0.06);
    const stEnd = rPeak + Math.round(this.sampleRate * 0.16);

    if (stEnd >= leadData.length) return false;

    // Scooped ST: initial downslope, then gradual upslope to T
    const stData = leadData.slice(stStart, stEnd);
    if (stData.length < 10) return false;

    // Check for concave upward morphology (second derivative positive)
    let scoopCount = 0;
    for (let i = 2; i < stData.length - 2; i++) {
      const secondDerivative = stData[i + 1] + stData[i - 1] - 2 * stData[i];
      if (secondDerivative > 0) scoopCount++;
    }

    return scoopCount > stData.length * 0.6;
  }

  private hasTerminalRInAVR(avrData: number[]): boolean {
    // Terminal R wave > 3mm in aVR suggests TCA toxicity
    const rPeaks = this.findRPeaks(avrData);
    if (rPeaks.length === 0) return false;

    const rPeak = rPeaks[0];

    // Look at terminal portion of QRS (last 40ms)
    const terminalStart = rPeak + Math.round(this.sampleRate * 0.02);
    const terminalEnd = Math.min(avrData.length, rPeak + Math.round(this.sampleRate * 0.06));

    if (terminalEnd >= avrData.length) return false;

    // Check if terminal portion is positive (R wave) and significant
    const terminalData = avrData.slice(terminalStart, terminalEnd);
    const maxTerminal = Math.max(...terminalData);
    const baseline = avrData[Math.max(0, rPeak - Math.round(this.sampleRate * 0.1))];

    // 3mm = ~300 microvolts depending on calibration
    return (maxTerminal - baseline) > 200;
  }

  private calculateFeatureConfidence(features: ElectrolyteFeature[]): number {
    const presentFeatures = features.filter(f => f.present);
    if (presentFeatures.length === 0) return 0;

    const avgConfidence = presentFeatures.reduce((sum, f) => sum + f.confidence, 0) / presentFeatures.length;
    return avgConfidence;
  }

  private calculateDrugFeatureConfidence(features: DrugFeature[]): number {
    const presentFeatures = features.filter(f => f.present);
    if (presentFeatures.length === 0) return 0;

    const avgConfidence = presentFeatures.reduce((sum, f) => sum + f.confidence, 0) / presentFeatures.length;
    return avgConfidence;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Analyze ECG for drug and electrolyte patterns
 */
export function analyzeForDrugElectrolyte(
  signal: ECGSignal,
  options?: DetectorOptions
): DrugElectrolyteResult {
  const detector = new DrugElectrolyteDetector(signal.sampleRate, options);
  return detector.analyze(signal);
}

/**
 * Quick check for critical electrolyte abnormalities
 */
export function hasElectrolyteEmergency(signal: ECGSignal): boolean {
  const result = analyzeForDrugElectrolyte(signal);
  return result.electrolytePatterns.some(e => e.severity === 'critical');
}

/**
 * Quick check for drug toxicity patterns
 */
export function hasDrugToxicity(signal: ECGSignal, knownMedications?: string[]): boolean {
  const result = analyzeForDrugElectrolyte(signal, { knownMedications });
  return result.drugPatterns.some(d => d.effectType === 'toxicity');
}
