/**
 * How a learner's psychometric profile adapts teaching: difficulty and pace
 * adjustments, scaffolding strategies, and how well a concept suits the
 * learner. Pure functions (no storage), used by the ZPD engine in
 * `education-graph-db.ts`, which keeps its methods of the same names.
 */
import { traitScore } from './trait-scores.ts';
import type { ConceptNode, LearnerProfile, PsychometricAdjustments, ScaffoldingStrategy } from './types.ts';

/**
 * Compute psychometric adjustments for a learner
 */
export function adjustForPsychometrics(profile: LearnerProfile): PsychometricAdjustments {
  const scores = profile.psychometricScores;

  // Default values
  let difficultyModifier = 0;
  let paceRecommendation: 'slower' | 'normal' | 'faster' = 'normal';
  const attentionConsiderations: string[] = [];
  const scaffoldingStrategies = selectScaffoldingStrategies(profile);
  let presentationStyle: 'visual' | 'verbal' | 'hands_on' | 'mixed' = 'mixed';

  // Analyze openness to experience (intellectual curiosity)
  const openness = traitScore(scores, 'openness');
  if (openness !== undefined) {
    if (openness > 70) {
      difficultyModifier += 0.2; // Can handle harder material
    } else if (openness < 30) {
      difficultyModifier -= 0.1;
    }
  }

  // Analyze conscientiousness (self-discipline)
  const conscientiousness = traitScore(scores, 'conscientiousness');
  if (conscientiousness !== undefined) {
    if (conscientiousness > 70) {
      paceRecommendation = 'faster'; // More self-disciplined can go faster
    } else if (conscientiousness < 30) {
      paceRecommendation = 'slower';
      attentionConsiderations.push('May need more structure and checkpoints');
    }
  }

  // Analyze neuroticism (emotional stability)
  const neuroticism = traitScore(scores, 'neuroticism');
  if (neuroticism !== undefined) {
    if (neuroticism > 70) {
      difficultyModifier -= 0.2; // Reduce stress with easier material
      attentionConsiderations.push('Keep encouragement high, minimize failure scenarios');
    }
  }

  // Analyze extraversion
  const extraversion = traitScore(scores, 'extraversion');
  if (extraversion !== undefined) {
    if (extraversion > 70) {
      attentionConsiderations.push('Benefits from collaborative learning');
    } else if (extraversion < 30) {
      attentionConsiderations.push('Prefers solo study, may be overwhelmed by group work');
    }
  }

  // Determine presentation style from learning style
  if (profile.learningStyle) {
    switch (profile.learningStyle.primary) {
      case 'visual':
        presentationStyle = 'visual';
        break;
      case 'auditory':
        presentationStyle = 'verbal';
        break;
      case 'kinesthetic':
        presentationStyle = 'hands_on';
        break;
      default:
        presentationStyle = 'mixed';
    }
  }

  // Cap difficulty modifier
  difficultyModifier = Math.max(-0.5, Math.min(0.5, difficultyModifier));

  return {
    difficultyModifier,
    paceRecommendation,
    attentionConsiderations,
    scaffoldingStrategies,
    presentationStyle,
  };
}

/**
 * Select scaffolding strategies based on learner profile
 */
export function selectScaffoldingStrategies(profile: LearnerProfile): ScaffoldingStrategy[] {
  const strategies: ScaffoldingStrategy[] = [];
  const scores = profile.psychometricScores;

  // Default strategy everyone benefits from
  strategies.push({
    type: 'worked_example',
    reason: 'Universal foundation for learning new concepts',
    priority: 8,
    source: 'general',
  });

  // Visual learners
  if (profile.learningStyle?.primary === 'visual') {
    strategies.push({
      type: 'visual_aids',
      reason: 'Primary learning modality is visual',
      priority: 9,
      source: 'profile',
    });
  }

  // High neuroticism - need more support
  const neuroticism = traitScore(scores, 'neuroticism');
  if (neuroticism !== undefined && neuroticism > 60) {
    strategies.push({
      type: 'guided_practice',
      reason: 'Reduces anxiety through step-by-step guidance',
      priority: 8,
      source: 'profile',
    });
    strategies.push({
      type: 'hints',
      reason: 'Provides safety net when struggling',
      priority: 7,
      source: 'profile',
    });
  }

  // Low working memory - need chunking
  if (profile.cognitiveProfile?.workingMemoryCapacity === 'low') {
    strategies.push({
      type: 'chunking',
      reason: 'Accommodates limited working memory capacity',
      priority: 9,
      source: 'profile',
    });
  }

  // High extraversion - social learning
  const extraversion = traitScore(scores, 'extraversion');
  if (extraversion !== undefined && extraversion > 70) {
    strategies.push({
      type: 'peer_discussion',
      reason: 'Leverages social learning preference',
      priority: 6,
      source: 'profile',
    });
  }

  // Low openness - needs analogies to familiar concepts
  const openness = traitScore(scores, 'openness');
  if (openness !== undefined && openness < 40) {
    strategies.push({
      type: 'analogy',
      reason: 'Connects new concepts to familiar ones',
      priority: 7,
      source: 'profile',
    });
  }

  // Short attention span - needs repetition
  if (profile.cognitiveProfile?.attentionSpan === 'short') {
    strategies.push({
      type: 'repetition',
      reason: 'Reinforces learning with shorter attention span',
      priority: 7,
      source: 'profile',
    });
  }

  // Kinesthetic learners
  if (profile.learningStyle?.primary === 'kinesthetic') {
    strategies.push({
      type: 'guided_practice',
      reason: 'Hands-on practice matches learning style',
      priority: 9,
      source: 'profile',
    });
  }

  // Sort by priority descending
  strategies.sort((a, b) => b.priority - a.priority);

  return strategies;
}


/**
 * Calculate how well a concept matches the learner's psychometric profile
 */
export function calculatePsychometricMatch(
  concept: ConceptNode,
  profile: LearnerProfile,
  adjustments: PsychometricAdjustments
): number {
  let match = 0.5; // Base match

  // Abstract concepts match high openness
  const openness = traitScore(profile.psychometricScores, 'openness');
  if (openness !== undefined) {
    if (concept.difficulty.abstractness > 0.7 && openness > 60) {
      match += 0.2;
    } else if (concept.difficulty.abstractness > 0.7 && openness < 40) {
      match -= 0.2;
    }
  }

  // High cognitive load concepts match high working memory
  if (profile.cognitiveProfile?.workingMemoryCapacity === 'high' && concept.difficulty.cognitiveLoad > 0.7) {
    match += 0.15;
  } else if (profile.cognitiveProfile?.workingMemoryCapacity === 'low' && concept.difficulty.cognitiveLoad > 0.7) {
    match -= 0.15;
  }

  // Adjust based on difficulty modifier alignment
  const adjustedDifficulty = concept.difficulty.absolute + (adjustments.difficultyModifier * 10);
  if (adjustedDifficulty >= 4 && adjustedDifficulty <= 7) {
    match += 0.1; // Optimal difficulty range
  }

  return Math.max(0, Math.min(1, match));
}
