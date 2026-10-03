export interface SignatureResult {
  authentic: boolean
  confidence: number
  similarity: number
  threshold: number
  scores: { hog: number; ssim: number; projection: number; aspect: number }
}
