/**
 * Critical Findings Detector
 * Detect life-threatening ECG patterns that require immediate attention
 *
 * This module detects:
 * - STEMI (ST-elevation myocardial infarction)
 * - Hyperkalemia patterns
 * - Long QT syndrome
 * - Brugada pattern
 * - Complete heart block
 * - Ventricular tachycardia/fibrillation
 * - Wellens' syndrome
 * - De Winter T waves
 *
 * CRITICAL: These findings require immediate clinical correlation!
 *
 * @module signal/loader/png-digitizer/signal/critical-findings
 */

import type { LeadName } from '../types';

/**
 * Urgency levels for critical findings
 */
export type UrgencyLevel = 'critical' | 'urgent' | 'abnormal' | 'borderline';

/**
 * STEMI territory
 */
export type STEMITerritory =
  | 'anterior'      // V1-V4 (LAD)
  | 'anteroseptal'  // V1-V2 (LAD septal)
  | 'anterolateral' // V3-V6, I, aVL (LAD/LCX)
  | 'lateral'       // I, aVL, V5-V6 (LCX)
  | 'inferior'      // II, III, aVF (RCA/LCX)
  | 'posterior'     // Reciprocal V1-V3 depression (RCA/LCX)
  | 'right_ventricular'; // V1, V4R (RCA)

/**
 * STEMI detection result
 */
export interface STEMIResult {
  /** STEMI detected */
  detected: boolean;

  /** Affected territory */
  territory?: STEMITerritory;

  /** Culprit vessel likely */
  culpritVessel?: 'LAD' | 'LCX' | 'RCA' | 'unknown';

  /** Leads with ST elevation */
  elevatedLeads: LeadName[];

  /** Maximum ST elevation (mV) */
  maxElevation: number;

  /** Reciprocal depression present */
  reciprocalDepression: boolean;

  /** Leads with reciprocal changes */
  reciprocalLeads: LeadName[];

  /** Sgarbossa criteria met (for LBBB) */
  sgarbossaCriteria?: {
    concordantSTElevation: boolean;
    concordantSTDepression: boolean;
    excessiveDiscordantElevation: boolean;
    score: number;
  };

  /** Confidence */
  confidence: number;

  /** Clinical message */
  message: string;
}

/**
 * Hyperkalemia detection result
 */
export interface HyperkalemiaResult {
  /** Pattern detected */
  detected: boolean;

  /** Severity level */
  severity: 'mild' | 'moderate' | 'severe' | 'critical';

  /** Estimated potassium range */
  estimatedK?: string;

  /** Features present */
  features: {
    peakedTWaves: boolean;
    widenedQRS: boolean;
    flattenedPWaves: boolean;
    prolongedPR: boolean;
    sineWavePattern: boolean;
  };

  /** Confidence */
  confidence: number;

  /** Clinical message */
  message: string;
}

/**
 * Long QT detection result
 */
export interface LongQTResult {
  /** Detected */
  detected: boolean;

  /** QTc value (ms) */
  qtc: number;

  /** Severity */
  severity: 'borderline' | 'prolonged' | 'markedly_prolonged';

  /** T wave morphology abnormality */
  tWaveAbnormality?: 'notched' | 'biphasic' | 'broad';

  /** Confidence */
  confidence: number;

  /** Clinical message */
  message: string;
}

/**
 * Brugada pattern detection result
 */
export interface BrugadaResult {
  /** Pattern detected */
  detected: boolean;

  /** Type */
  type?: 'type1_coved' | 'type2_saddleback';

  /** Leads affected (typically V1-V2) */
  affectedLeads: LeadName[];

  /** ST elevation amount (mV) */
  stElevation: number;

  /** Confidence */
  confidence: number;

  /** Clinical message */
  message: string;
}

/**
 * Complete heart block detection
 */
export interface HeartBlockResult {
  /** Detected */
  detected: boolean;

  /** Degree */
  degree?: 'first' | 'second_type1' | 'second_type2' | 'third';

  /** Atrial rate */
  atrialRate?: number;

  /** Ventricular rate */
  ventricularRate?: number;

  /** AV dissociation present */
  avDissociation: boolean;

  /** Confidence */
  confidence: number;

  /** Clinical message */
  message: string;
}

/**
 * Wellens' syndrome detection
 */
export interface WellensResult {
  /** Detected */
  detected: boolean;

  /** Type */
  type?: 'type1_biphasic' | 'type2_deep_symmetric';

  /** Affected leads */
  affectedLeads: LeadName[];

  /** Confidence */
  confidence: number;

  /** Clinical message */
  message: string;
}

/**
 * De Winter T waves detection
 */
export interface DeWinterResult {
  /** Detected */
  detected: boolean;

  /** ST depression amount (mV) */
  stDepression: number;

  /** T wave amplitude (mV) */
  tWaveAmplitude: number;

  /** Affected leads */
  affectedLeads: LeadName[];

  /** Confidence */
  confidence: number;

  /** Clinical message */
  message: string;
}

/**
 * Critical finding
 */
export interface CriticalFinding {
  /** Finding type */
  type: string;

  /** Urgency level */
  urgency: UrgencyLevel;

  /** Short description */
  title: string;

  /** Detailed message */
  message: string;

  /** Recommended action */
  action: string;

  /** Confidence (0-1) */
  confidence: number;

  /** Supporting evidence */
  evidence: string[];
}

/**
 * Complete critical findings analysis
 */
export interface CriticalFindingsResult {
  /** Any critical findings present */
  hasCriticalFindings: boolean;

  /** Highest urgency level */
  maxUrgency: UrgencyLevel;

  /** All findings */
  findings: CriticalFinding[];

  /** STEMI analysis */
  stemi: STEMIResult;

  /** Hyperkalemia analysis */
  hyperkalemia: HyperkalemiaResult;

  /** Long QT analysis */
  longQT: LongQTResult;

  /** Brugada analysis */
  brugada: BrugadaResult;

  /** Heart block analysis */
  heartBlock: HeartBlockResult;

  /** Wellens analysis */
  wellens: WellensResult;

  /** De Winter analysis */
  deWinter: DeWinterResult;

  /** Overall confidence */
  confidence: number;

  /** Processing warnings */
  warnings: string[];
}

/**
 * Critical Findings Detector
 */
export class CriticalFindingsDetector {
  private leads: Partial<Record<LeadName, number[]>>;
  private sampleRate: number;

  constructor(leads: Partial<Record<LeadName, number[]>>, sampleRate: number) {
    this.leads = leads;
    this.sampleRate = sampleRate;
  }

  /**
   * Detect all critical findings
   */
  detect(): CriticalFindingsResult {
    const warnings: string[] = [];
    const findings: CriticalFinding[] = [];

    // Run all detectors
    const stemi = this.detectSTEMI();
    const hyperkalemia = this.detectHyperkalemia();
    const longQT = this.detectLongQT();
    const brugada = this.detectBrugada();
    const heartBlock = this.detectHeartBlock();
    const wellens = this.detectWellens();
    const deWinter = this.detectDeWinter();

    // Collect findings
    if (stemi.detected) {
      findings.push({
        type: 'STEMI',
        urgency: 'critical',
        title: `STEMI - ${stemi.territory} territory`,
        message: stemi.message,
        action: 'ACTIVATE CATH LAB IMMEDIATELY. Time is muscle.',
        confidence: stemi.confidence,
        evidence: [
          `ST elevation in: ${stemi.elevatedLeads.join(', ')}`,
          `Max elevation: ${stemi.maxElevation.toFixed(2)} mV`,
          stemi.reciprocalDepression ? `Reciprocal changes in: ${stemi.reciprocalLeads.join(', ')}` : '',
        ].filter(Boolean),
      });
    }

    if (hyperkalemia.detected) {
      findings.push({
        type: 'Hyperkalemia',
        urgency: hyperkalemia.severity === 'critical' ? 'critical' : 'urgent',
        title: `Hyperkalemia - ${hyperkalemia.severity}`,
        message: hyperkalemia.message,
        action: 'Check potassium STAT. Consider calcium gluconate, insulin/glucose, kayexalate.',
        confidence: hyperkalemia.confidence,
        evidence: Object.entries(hyperkalemia.features)
          .filter(([, v]) => v)
          .map(([k]) => k.replace(/([A-Z])/g, ' $1').toLowerCase()),
      });
    }

    if (longQT.detected) {
      findings.push({
        type: 'Long QT',
        urgency: longQT.severity === 'markedly_prolonged' ? 'urgent' : 'abnormal',
        title: `Long QT - QTc ${longQT.qtc.toFixed(0)} ms`,
        message: longQT.message,
        action: 'Review medications. Consider Mg replacement. Avoid QT-prolonging drugs.',
        confidence: longQT.confidence,
        evidence: [`QTc: ${longQT.qtc.toFixed(0)} ms`],
      });
    }

    if (brugada.detected) {
      findings.push({
        type: 'Brugada Pattern',
        urgency: brugada.type === 'type1_coved' ? 'urgent' : 'abnormal',
        title: `Brugada Pattern - ${brugada.type === 'type1_coved' ? 'Type 1 (coved)' : 'Type 2'}`,
        message: brugada.message,
        action: 'Cardiology consult. Consider EP study/ICD evaluation.',
        confidence: brugada.confidence,
        evidence: [`ST elevation in V1-V2: ${brugada.stElevation.toFixed(2)} mV`],
      });
    }

    if (heartBlock.detected && heartBlock.degree === 'third') {
      findings.push({
        type: 'Complete Heart Block',
        urgency: 'critical',
        title: 'Third-Degree AV Block',
        message: heartBlock.message,
        action: 'Prepare for transcutaneous pacing. Cardiology consult STAT.',
        confidence: heartBlock.confidence,
        evidence: [
          `Atrial rate: ${heartBlock.atrialRate} bpm`,
          `Ventricular rate: ${heartBlock.ventricularRate} bpm`,
          'AV dissociation present',
        ],
      });
    }

    if (wellens.detected) {
      findings.push({
        type: 'Wellens Syndrome',
        urgency: 'urgent',
        title: `Wellens' Pattern - ${wellens.type === 'type2_deep_symmetric' ? 'Type 2' : 'Type 1'}`,
        message: wellens.message,
        action: 'HIGH RISK for proximal LAD occlusion. Cardiology consult. Avoid stress testing.',
        confidence: wellens.confidence,
        evidence: wellens.affectedLeads.map(l => `${l}: deep T wave inversion`),
      });
    }

    if (deWinter.detected) {
      findings.push({
        type: 'De Winter Pattern',
        urgency: 'critical',
        title: 'De Winter T Waves - STEMI Equivalent',
        message: deWinter.message,
        action: 'STEMI EQUIVALENT - Activate cath lab. Proximal LAD occlusion likely.',
        confidence: deWinter.confidence,
        evidence: [
          `ST depression: ${deWinter.stDepression.toFixed(2)} mV`,
          `Tall T waves: ${deWinter.tWaveAmplitude.toFixed(2)} mV`,
        ],
      });
    }

    // Determine overall results
    const hasCriticalFindings = findings.some(f => f.urgency === 'critical');
    let maxUrgency: UrgencyLevel = 'borderline';
    if (findings.some(f => f.urgency === 'critical')) maxUrgency = 'critical';
    else if (findings.some(f => f.urgency === 'urgent')) maxUrgency = 'urgent';
    else if (findings.some(f => f.urgency === 'abnormal')) maxUrgency = 'abnormal';

    const confidence = findings.length > 0
      ? Math.max(...findings.map(f => f.confidence))
      : 0.9;

    return {
      hasCriticalFindings,
      maxUrgency,
      findings,
      stemi,
      hyperkalemia,
      longQT,
      brugada,
      heartBlock,
      wellens,
      deWinter,
      confidence,
      warnings,
    };
  }

  /**
   * Detect STEMI
   */
  private detectSTEMI(): STEMIResult {
    const stElevations: Partial<Record<LeadName, number>> = {};
    const stDepressions: Partial<Record<LeadName, number>> = {};

    // Measure ST deviation in all leads
    for (const [lead, samples] of Object.entries(this.leads) as [LeadName, number[]][]) {
      if (!samples || samples.length < this.sampleRate) continue;
      const deviation = this.measureSTDeviation(samples);
      if (deviation > 0.05) stElevations[lead] = deviation;
      else if (deviation < -0.05) stDepressions[lead] = deviation;
    }

    const elevatedLeads = Object.keys(stElevations) as LeadName[];
    const depressedLeads = Object.keys(stDepressions) as LeadName[];
    const maxElevation = elevatedLeads.length > 0
      ? Math.max(...Object.values(stElevations))
      : 0;

    // Check for STEMI criteria by territory
    let detected = false;
    let territory: STEMITerritory | undefined;
    let culpritVessel: STEMIResult['culpritVessel'] = 'unknown';

    // Anterior STEMI: V1-V4
    const anteriorLeads: LeadName[] = ['V1', 'V2', 'V3', 'V4'];
    const anteriorElevated = anteriorLeads.filter(l => stElevations[l] && stElevations[l] >= 0.1);
    if (anteriorElevated.length >= 2) {
      detected = true;
      territory = 'anterior';
      culpritVessel = 'LAD';
    }

    // Inferior STEMI: II, III, aVF
    const inferiorLeads: LeadName[] = ['II', 'III', 'aVF'];
    const inferiorElevated = inferiorLeads.filter(l => stElevations[l] && stElevations[l] >= 0.1);
    if (inferiorElevated.length >= 2) {
      detected = true;
      territory = 'inferior';
      culpritVessel = 'RCA'; // Could also be LCX
    }

    // Lateral STEMI: I, aVL, V5, V6
    const lateralLeads: LeadName[] = ['I', 'aVL', 'V5', 'V6'];
    const lateralElevated = lateralLeads.filter(l => stElevations[l] && stElevations[l] >= 0.1);
    if (lateralElevated.length >= 2) {
      detected = true;
      territory = 'lateral';
      culpritVessel = 'LCX';
    }

    // Check for reciprocal changes
    const reciprocalDepression = depressedLeads.length > 0 && detected;
    const reciprocalLeads = depressedLeads;

    // Calculate confidence
    let confidence = 0;
    if (detected) {
      confidence = 0.6;
      if (reciprocalDepression) confidence += 0.2;
      if (maxElevation > 0.2) confidence += 0.1;
      if (elevatedLeads.length >= 3) confidence += 0.1;
    }

    const message = detected
      ? `${territory?.toUpperCase()} STEMI suspected. ST elevation in ${elevatedLeads.join(', ')}. ` +
        `${reciprocalDepression ? `Reciprocal depression in ${reciprocalLeads.join(', ')}.` : ''} ` +
        `Likely culprit: ${culpritVessel}.`
      : 'No STEMI pattern detected.';

    return {
      detected,
      territory,
      culpritVessel: detected ? culpritVessel : undefined,
      elevatedLeads,
      maxElevation,
      reciprocalDepression,
      reciprocalLeads,
      confidence,
      message,
    };
  }

  /**
   * Detect Hyperkalemia patterns
   */
  private detectHyperkalemia(): HyperkalemiaResult {
    const features = {
      peakedTWaves: false,
      widenedQRS: false,
      flattenedPWaves: false,
      prolongedPR: false,
      sineWavePattern: false,
    };

    // Use Lead II or V2-V4 for T wave analysis
    const analysisLead = this.leads['II'] || this.leads['V3'] || this.leads['V2'];
    if (!analysisLead || analysisLead.length < this.sampleRate) {
      return {
        detected: false,
        severity: 'mild',
        features,
        confidence: 0,
        message: 'Insufficient data for hyperkalemia analysis.',
      };
    }

    // Detect peaked T waves (tall, narrow, symmetric)
    const tWaveAnalysis = this.analyzeTWave(analysisLead);
    if (tWaveAnalysis.amplitude > 600 && tWaveAnalysis.symmetry > 0.7) {
      features.peakedTWaves = true;
    }

    // Detect widened QRS
    const qrsDuration = this.measureQRSDuration(analysisLead);
    if (qrsDuration > 120) {
      features.widenedQRS = true;
    }

    // Detect flattened/absent P waves
    const pWaveAmplitude = this.measurePWaveAmplitude(analysisLead);
    if (pWaveAmplitude < 50) {
      features.flattenedPWaves = true;
    }

    // Detect sine wave pattern (severe)
    if (features.widenedQRS && qrsDuration > 160) {
      features.sineWavePattern = this.detectSineWavePattern(analysisLead);
    }

    // Determine severity
    const featureCount = Object.values(features).filter(Boolean).length;
    let severity: HyperkalemiaResult['severity'] = 'mild';
    let estimatedK: string | undefined;

    if (features.sineWavePattern) {
      severity = 'critical';
      estimatedK = '>8.0 mEq/L';
    } else if (featureCount >= 3) {
      severity = 'severe';
      estimatedK = '7.0-8.0 mEq/L';
    } else if (featureCount >= 2) {
      severity = 'moderate';
      estimatedK = '6.0-7.0 mEq/L';
    } else if (featureCount >= 1) {
      severity = 'mild';
      estimatedK = '5.5-6.0 mEq/L';
    }

    const detected = featureCount >= 1;
    const confidence = detected ? Math.min(0.9, 0.4 + featureCount * 0.15) : 0;

    const message = detected
      ? `Hyperkalemia pattern detected (${severity}). ` +
        `Features: ${Object.entries(features).filter(([, v]) => v).map(([k]) => k).join(', ')}. ` +
        `${estimatedK ? `Estimated K+: ${estimatedK}` : ''}`
      : 'No hyperkalemia pattern detected.';

    return {
      detected,
      severity,
      estimatedK,
      features,
      confidence,
      message,
    };
  }

  /**
   * Detect Long QT
   */
  private detectLongQT(): LongQTResult {
    const analysisLead = this.leads['II'] || this.leads['V5'];
    if (!analysisLead || analysisLead.length < this.sampleRate) {
      return {
        detected: false,
        qtc: 0,
        severity: 'borderline',
        confidence: 0,
        message: 'Insufficient data for QT analysis.',
      };
    }

    // Measure QT and RR intervals
    const { qtInterval, rrInterval } = this.measureQTandRR(analysisLead);

    if (!qtInterval || !rrInterval || rrInterval === 0) {
      return {
        detected: false,
        qtc: 0,
        severity: 'borderline',
        confidence: 0,
        message: 'Could not measure QT interval.',
      };
    }

    // Calculate QTc (Bazett)
    const rrSec = rrInterval / 1000;
    const qtc = qtInterval / Math.sqrt(rrSec);

    // Determine severity
    let severity: LongQTResult['severity'] = 'borderline';
    let detected = false;

    if (qtc > 500) {
      severity = 'markedly_prolonged';
      detected = true;
    } else if (qtc > 470) {
      severity = 'prolonged';
      detected = true;
    } else if (qtc > 450) {
      severity = 'borderline';
      detected = true;
    }

    const confidence = detected ? 0.8 : 0.9;

    const message = detected
      ? `Long QT detected. QTc: ${qtc.toFixed(0)} ms (${severity.replace('_', ' ')}). ` +
        'Risk of Torsades de Pointes.'
      : `QTc: ${qtc.toFixed(0)} ms (normal).`;

    return {
      detected,
      qtc,
      severity,
      confidence,
      message,
    };
  }

  /**
   * Detect Brugada pattern
   */
  private detectBrugada(): BrugadaResult {
    const v1 = this.leads['V1'];
    const v2 = this.leads['V2'];

    if (!v1 && !v2) {
      return {
        detected: false,
        affectedLeads: [],
        stElevation: 0,
        confidence: 0,
        message: 'V1/V2 leads required for Brugada detection.',
      };
    }

    let detected = false;
    let type: BrugadaResult['type'];
    const affectedLeads: LeadName[] = [];
    let maxElevation = 0;

    // Check V1 and V2 for characteristic pattern
    for (const [leadName, samples] of [['V1', v1], ['V2', v2]] as [LeadName, number[] | undefined][]) {
      if (!samples || samples.length < this.sampleRate) continue;

      const stDev = this.measureSTDeviation(samples);
      const morphology = this.analyzeSTMorphology(samples);

      if (stDev > 0.2) { // >2mm ST elevation
        if (morphology === 'coved') {
          detected = true;
          type = 'type1_coved';
          affectedLeads.push(leadName);
          maxElevation = Math.max(maxElevation, stDev);
        } else if (morphology === 'saddleback') {
          detected = true;
          type = type || 'type2_saddleback';
          affectedLeads.push(leadName);
          maxElevation = Math.max(maxElevation, stDev);
        }
      }
    }

    const confidence = detected ? (type === 'type1_coved' ? 0.8 : 0.6) : 0;

    const message = detected
      ? `Brugada pattern detected (${type === 'type1_coved' ? 'Type 1 - coved' : 'Type 2 - saddleback'}). ` +
        `ST elevation: ${maxElevation.toFixed(2)} mV in ${affectedLeads.join(', ')}.`
      : 'No Brugada pattern detected.';

    return {
      detected,
      type,
      affectedLeads,
      stElevation: maxElevation,
      confidence,
      message,
    };
  }

  /**
   * Detect complete heart block
   */
  private detectHeartBlock(): HeartBlockResult {
    const analysisLead = this.leads['II'] || this.leads['I'];
    if (!analysisLead || analysisLead.length < this.sampleRate * 3) {
      return {
        detected: false,
        avDissociation: false,
        confidence: 0,
        message: 'Insufficient data for heart block analysis.',
      };
    }

    // Detect P waves and R waves separately
    const rPeaks = this.detectRPeaks(analysisLead);
    const pPeaks = this.detectPWaves(analysisLead, rPeaks);

    if (rPeaks.length < 3 || pPeaks.length < 3) {
      return {
        detected: false,
        avDissociation: false,
        confidence: 0,
        message: 'Insufficient beats for heart block analysis.',
      };
    }

    // Calculate rates
    const ventricularRate = this.calculateRate(rPeaks);
    const atrialRate = this.calculateRate(pPeaks);

    // Check for AV dissociation (rates different, no fixed relationship)
    const avDissociation = Math.abs(atrialRate - ventricularRate) > 10 &&
      !this.hasFixedPRRelationship(pPeaks, rPeaks);

    let detected = false;
    let degree: HeartBlockResult['degree'];

    if (avDissociation && atrialRate > ventricularRate) {
      detected = true;
      degree = 'third';
    }

    const confidence = detected ? 0.75 : 0;

    const message = detected
      ? `Complete (third-degree) AV block detected. ` +
        `Atrial rate: ${atrialRate.toFixed(0)} bpm, Ventricular rate: ${ventricularRate.toFixed(0)} bpm. ` +
        'AV dissociation present.'
      : 'No complete heart block detected.';

    return {
      detected,
      degree,
      atrialRate: detected ? atrialRate : undefined,
      ventricularRate: detected ? ventricularRate : undefined,
      avDissociation,
      confidence,
      message,
    };
  }

  /**
   * Detect Wellens' syndrome
   */
  private detectWellens(): WellensResult {
    // Wellens' affects V2-V3 primarily (sometimes V1-V4)
    const precordialLeads: LeadName[] = ['V1', 'V2', 'V3', 'V4'];
    const affectedLeads: LeadName[] = [];
    let type: WellensResult['type'];

    for (const leadName of precordialLeads) {
      const samples = this.leads[leadName];
      if (!samples || samples.length < this.sampleRate) continue;

      const tWave = this.analyzeTWave(samples);

      // Type 1: Biphasic T waves (positive then negative)
      if (tWave.biphasic && tWave.amplitude < -200) {
        affectedLeads.push(leadName);
        type = 'type1_biphasic';
      }

      // Type 2: Deep symmetric T wave inversion (>2mm)
      if (!tWave.biphasic && tWave.amplitude < -200 && tWave.symmetry > 0.6) {
        affectedLeads.push(leadName);
        type = type || 'type2_deep_symmetric';
      }
    }

    // Wellens' typically affects V2-V3
    const detected = affectedLeads.includes('V2') || affectedLeads.includes('V3');
    const confidence = detected ? 0.7 : 0;

    const message = detected
      ? `Wellens' syndrome pattern detected (${type === 'type2_deep_symmetric' ? 'Type 2' : 'Type 1'}). ` +
        `Deep T wave inversion in ${affectedLeads.join(', ')}. ` +
        'High risk for proximal LAD occlusion.'
      : 'No Wellens\' pattern detected.';

    return {
      detected,
      type: detected ? type : undefined,
      affectedLeads,
      confidence,
      message,
    };
  }

  /**
   * Detect De Winter T waves
   */
  private detectDeWinter(): DeWinterResult {
    // De Winter: ST depression + tall symmetric T waves in V1-V6
    const precordialLeads: LeadName[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
    let totalSTDepression = 0;
    let maxTWaveAmp = 0;
    const affectedLeads: LeadName[] = [];

    for (const leadName of precordialLeads) {
      const samples = this.leads[leadName];
      if (!samples || samples.length < this.sampleRate) continue;

      const stDev = this.measureSTDeviation(samples);
      const tWave = this.analyzeTWave(samples);

      // Look for: 1-3mm upsloping ST depression + tall T wave
      if (stDev < -0.1 && stDev > -0.3 && tWave.amplitude > 500) {
        affectedLeads.push(leadName);
        totalSTDepression += Math.abs(stDev);
        maxTWaveAmp = Math.max(maxTWaveAmp, tWave.amplitude);
      }
    }

    // De Winter typically affects multiple precordial leads
    const detected = affectedLeads.length >= 3;
    const avgSTDepression = affectedLeads.length > 0 ? totalSTDepression / affectedLeads.length : 0;
    const confidence = detected ? 0.75 : 0;

    const message = detected
      ? `De Winter T wave pattern detected - STEMI EQUIVALENT. ` +
        `ST depression ${avgSTDepression.toFixed(2)} mV with tall T waves in ${affectedLeads.join(', ')}. ` +
        'Indicates proximal LAD occlusion.'
      : 'No De Winter pattern detected.';

    return {
      detected,
      stDepression: avgSTDepression,
      tWaveAmplitude: maxTWaveAmp / 1000, // Convert to mV
      affectedLeads,
      confidence,
      message,
    };
  }

  // === Helper Methods ===

  private measureSTDeviation(samples: number[]): number {
    const rPeaks = this.detectRPeaks(samples);
    if (rPeaks.length === 0) return 0;

    const deviations: number[] = [];

    for (const rIdx of rPeaks) {
      // Find J point (end of QRS)
      const jPoint = this.findJPoint(samples, rIdx);
      if (jPoint < 0) continue;

      // Measure ST 60ms after J point
      const stPoint = jPoint + Math.floor(this.sampleRate * 0.06);
      if (stPoint >= samples.length) continue;

      // Calculate baseline (PR segment)
      const baseline = this.getBaseline(samples, rIdx);

      // ST deviation in mV
      deviations.push((samples[stPoint] - baseline) / 1000);
    }

    return deviations.length > 0
      ? deviations.reduce((a, b) => a + b, 0) / deviations.length
      : 0;
  }

  private findJPoint(samples: number[], rIdx: number): number {
    // Search for S wave nadir, then return to baseline
    const searchEnd = Math.min(samples.length, rIdx + Math.floor(this.sampleRate * 0.12));

    let minVal = samples[rIdx];
    let minIdx = rIdx;

    for (let i = rIdx; i < searchEnd; i++) {
      if (samples[i] < minVal) {
        minVal = samples[i];
        minIdx = i;
      }
    }

    // J point is when signal returns toward baseline after S
    const baseline = this.getBaseline(samples, rIdx);
    for (let i = minIdx; i < searchEnd; i++) {
      if (Math.abs(samples[i] - baseline) < Math.abs(minVal - baseline) * 0.3) {
        return i;
      }
    }

    return minIdx + Math.floor(this.sampleRate * 0.04);
  }

  private getBaseline(samples: number[], rIdx: number): number {
    const prStart = Math.max(0, rIdx - Math.floor(this.sampleRate * 0.2));
    const prEnd = rIdx - Math.floor(this.sampleRate * 0.05);

    if (prEnd <= prStart) return 0;

    const prSegment = samples.slice(prStart, prEnd);
    return prSegment.reduce((a, b) => a + b, 0) / prSegment.length;
  }

  private detectRPeaks(samples: number[]): number[] {
    const peaks: number[] = [];
    const threshold = Math.max(...samples.map(Math.abs)) * 0.4;
    const minRR = Math.floor(this.sampleRate * 0.3);

    let lastPeak = -minRR;

    for (let i = 1; i < samples.length - 1; i++) {
      if (
        samples[i] > threshold &&
        samples[i] >= samples[i - 1] &&
        samples[i] >= samples[i + 1] &&
        i - lastPeak >= minRR
      ) {
        peaks.push(i);
        lastPeak = i;
      }
    }

    return peaks;
  }

  private detectPWaves(samples: number[], rPeaks: number[]): number[] {
    const pPeaks: number[] = [];

    for (const rIdx of rPeaks) {
      const searchStart = Math.max(0, rIdx - Math.floor(this.sampleRate * 0.3));
      const searchEnd = rIdx - Math.floor(this.sampleRate * 0.05);

      if (searchEnd <= searchStart) continue;

      const pRegion = samples.slice(searchStart, searchEnd);
      const maxIdx = pRegion.indexOf(Math.max(...pRegion));

      pPeaks.push(searchStart + maxIdx);
    }

    return pPeaks;
  }

  private calculateRate(peaks: number[]): number {
    if (peaks.length < 2) return 0;

    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return (60 * this.sampleRate) / avgInterval;
  }

  private hasFixedPRRelationship(pPeaks: number[], rPeaks: number[]): boolean {
    if (pPeaks.length < 3 || rPeaks.length < 3) return false;

    const prIntervals: number[] = [];

    for (let i = 0; i < Math.min(pPeaks.length, rPeaks.length); i++) {
      if (rPeaks[i] > pPeaks[i]) {
        prIntervals.push(rPeaks[i] - pPeaks[i]);
      }
    }

    if (prIntervals.length < 2) return false;

    const avgPR = prIntervals.reduce((a, b) => a + b, 0) / prIntervals.length;
    const variance = prIntervals.reduce((sum, pr) => sum + Math.pow(pr - avgPR, 2), 0) / prIntervals.length;
    const stdDev = Math.sqrt(variance);

    // Fixed PR if std dev < 50ms
    return stdDev < this.sampleRate * 0.05;
  }

  private analyzeTWave(samples: number[]): {
    amplitude: number;
    symmetry: number;
    biphasic: boolean;
  } {
    const rPeaks = this.detectRPeaks(samples);
    if (rPeaks.length === 0) {
      return { amplitude: 0, symmetry: 0, biphasic: false };
    }

    // Find T wave after middle R peak
    const rIdx = rPeaks[Math.floor(rPeaks.length / 2)];
    const tStart = rIdx + Math.floor(this.sampleRate * 0.15);
    const tEnd = Math.min(samples.length, rIdx + Math.floor(this.sampleRate * 0.45));

    if (tEnd <= tStart) {
      return { amplitude: 0, symmetry: 0, biphasic: false };
    }

    const tRegion = samples.slice(tStart, tEnd);
    const baseline = this.getBaseline(samples, rIdx);

    // Find T peak (max deviation from baseline)
    let maxAmp = 0;
    let maxIdx = 0;

    for (let i = 0; i < tRegion.length; i++) {
      const amp = tRegion[i] - baseline;
      if (Math.abs(amp) > Math.abs(maxAmp)) {
        maxAmp = amp;
        maxIdx = i;
      }
    }

    // Check for biphasic (changes sign)
    let signChanges = 0;
    let lastSign = Math.sign(tRegion[0] - baseline);
    for (let i = 1; i < tRegion.length; i++) {
      const currentSign = Math.sign(tRegion[i] - baseline);
      if (currentSign !== 0 && currentSign !== lastSign) {
        signChanges++;
        lastSign = currentSign;
      }
    }

    const biphasic = signChanges >= 1;

    // Calculate symmetry (compare left and right halves of T wave)
    const leftHalf = tRegion.slice(0, maxIdx);
    const rightHalf = tRegion.slice(maxIdx).reverse();
    const minLen = Math.min(leftHalf.length, rightHalf.length);

    let symmetryScore = 0;
    if (minLen > 0) {
      for (let i = 0; i < minLen; i++) {
        const diff = Math.abs(leftHalf[leftHalf.length - 1 - i] - rightHalf[i]);
        symmetryScore += 1 - Math.min(1, diff / (Math.abs(maxAmp) + 1));
      }
      symmetryScore /= minLen;
    }

    return {
      amplitude: maxAmp,
      symmetry: symmetryScore,
      biphasic,
    };
  }

  private measureQRSDuration(samples: number[]): number {
    const rPeaks = this.detectRPeaks(samples);
    if (rPeaks.length === 0) return 0;

    const durations: number[] = [];

    for (const rIdx of rPeaks) {
      const baseline = this.getBaseline(samples, rIdx);
      const threshold = Math.abs(samples[rIdx] - baseline) * 0.1;

      // Find QRS start
      let qStart = rIdx;
      for (let i = rIdx; i > Math.max(0, rIdx - this.sampleRate * 0.1); i--) {
        if (Math.abs(samples[i] - baseline) < threshold) {
          qStart = i;
          break;
        }
      }

      // Find QRS end
      let sEnd = rIdx;
      for (let i = rIdx; i < Math.min(samples.length, rIdx + this.sampleRate * 0.1); i++) {
        if (Math.abs(samples[i] - baseline) < threshold) {
          sEnd = i;
          break;
        }
      }

      durations.push((sEnd - qStart) * 1000 / this.sampleRate);
    }

    return durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
  }

  private measurePWaveAmplitude(samples: number[]): number {
    const rPeaks = this.detectRPeaks(samples);
    if (rPeaks.length === 0) return 0;

    const amplitudes: number[] = [];

    for (const rIdx of rPeaks) {
      const pStart = Math.max(0, rIdx - Math.floor(this.sampleRate * 0.3));
      const pEnd = rIdx - Math.floor(this.sampleRate * 0.05);

      if (pEnd <= pStart) continue;

      const pRegion = samples.slice(pStart, pEnd);
      const baseline = this.getBaseline(samples, rIdx);

      const maxP = Math.max(...pRegion);
      amplitudes.push(maxP - baseline);
    }

    return amplitudes.length > 0
      ? amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length
      : 0;
  }

  private detectSineWavePattern(samples: number[]): boolean {
    // Sine wave pattern: very wide QRS that merges with T wave
    const qrsDuration = this.measureQRSDuration(samples);

    // If QRS > 180ms and smooth sinusoidal appearance
    if (qrsDuration < 180) return false;

    // Check for smooth sinusoidal pattern (low high-frequency content)
    const derivative = samples.slice(1).map((v, i) => Math.abs(v - samples[i]));
    const avgDerivative = derivative.reduce((a, b) => a + b, 0) / derivative.length;
    const maxValue = Math.max(...samples.map(Math.abs));

    // Smooth pattern has low derivative relative to amplitude
    return avgDerivative < maxValue * 0.1;
  }

  private analyzeSTMorphology(samples: number[]): 'coved' | 'saddleback' | 'normal' {
    const rPeaks = this.detectRPeaks(samples);
    if (rPeaks.length === 0) return 'normal';

    const rIdx = rPeaks[Math.floor(rPeaks.length / 2)];
    const jPoint = this.findJPoint(samples, rIdx);

    // Analyze ST segment shape (J point to T peak)
    const stStart = jPoint;
    const stEnd = Math.min(samples.length, jPoint + Math.floor(this.sampleRate * 0.15));

    if (stEnd <= stStart) return 'normal';

    const stSegment = samples.slice(stStart, stEnd);
    const baseline = this.getBaseline(samples, rIdx);

    // Check for coved (convex upward, then inversion)
    let maxIdx = 0;
    let maxVal = stSegment[0];
    for (let i = 1; i < stSegment.length; i++) {
      if (stSegment[i] > maxVal) {
        maxVal = stSegment[i];
        maxIdx = i;
      }
    }

    // Coved: peak early, then descends below baseline
    if (maxIdx < stSegment.length / 3 && stSegment[stSegment.length - 1] < baseline) {
      return 'coved';
    }

    // Saddleback: two peaks with dip in between
    let dips = 0;
    for (let i = 1; i < stSegment.length - 1; i++) {
      if (stSegment[i] < stSegment[i - 1] && stSegment[i] < stSegment[i + 1]) {
        dips++;
      }
    }

    if (dips >= 1 && stSegment[0] > baseline && stSegment[stSegment.length - 1] > baseline) {
      return 'saddleback';
    }

    return 'normal';
  }

  private measureQTandRR(samples: number[]): { qtInterval: number | null; rrInterval: number | null } {
    const rPeaks = this.detectRPeaks(samples);
    if (rPeaks.length < 2) return { qtInterval: null, rrInterval: null };

    // RR interval
    const rrIntervals: number[] = [];
    for (let i = 1; i < rPeaks.length; i++) {
      rrIntervals.push((rPeaks[i] - rPeaks[i - 1]) * 1000 / this.sampleRate);
    }
    const rrInterval = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;

    // QT interval (from Q onset to T end)
    const qtIntervals: number[] = [];

    for (const rIdx of rPeaks) {
      // Find Q onset
      const qOnset = this.findQOnset(samples, rIdx);

      // Find T end
      const tEnd = this.findTEnd(samples, rIdx);

      if (qOnset >= 0 && tEnd > rIdx) {
        qtIntervals.push((tEnd - qOnset) * 1000 / this.sampleRate);
      }
    }

    const qtInterval = qtIntervals.length > 0
      ? qtIntervals.reduce((a, b) => a + b, 0) / qtIntervals.length
      : null;

    return { qtInterval, rrInterval };
  }

  private findQOnset(samples: number[], rIdx: number): number {
    const baseline = this.getBaseline(samples, rIdx);
    const threshold = Math.abs(samples[rIdx] - baseline) * 0.05;

    for (let i = rIdx - 1; i > Math.max(0, rIdx - this.sampleRate * 0.1); i--) {
      if (Math.abs(samples[i] - baseline) < threshold) {
        return i;
      }
    }

    return rIdx - Math.floor(this.sampleRate * 0.04);
  }

  private findTEnd(samples: number[], rIdx: number): number {
    const baseline = this.getBaseline(samples, rIdx);

    // Search for T wave end (return to baseline after T peak)
    const searchStart = rIdx + Math.floor(this.sampleRate * 0.2);
    const searchEnd = Math.min(samples.length, rIdx + Math.floor(this.sampleRate * 0.5));

    if (searchStart >= searchEnd) return -1;

    // Find T peak first
    const tRegion = samples.slice(searchStart, searchEnd);
    const tPeak = tRegion.indexOf(Math.max(...tRegion.map(Math.abs)));
    const tPeakIdx = searchStart + tPeak;

    // Find where signal returns to baseline after T peak
    const threshold = Math.abs(samples[tPeakIdx] - baseline) * 0.1;

    for (let i = tPeakIdx; i < searchEnd; i++) {
      if (Math.abs(samples[i] - baseline) < threshold) {
        return i;
      }
    }

    return tPeakIdx + Math.floor(this.sampleRate * 0.1);
  }
}

/**
 * Convenience function to detect critical findings
 */
export function detectCriticalFindings(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): CriticalFindingsResult {
  const detector = new CriticalFindingsDetector(leads, sampleRate);
  return detector.detect();
}
