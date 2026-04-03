/**
 * Combines design tokens and component base styles into a single string
 * for injection into each element's Shadow DOM.
 *
 * Vite's ?inline query returns the CSS file contents as a string —
 * Rollup bundles it into the IIFE so there are no external stylesheet requests.
 */
import tokensCss from './tokens.css?inline'
import baseCss from './base.css?inline'

export const SHARED_CSS: string = `${tokensCss}\n${baseCss}`
