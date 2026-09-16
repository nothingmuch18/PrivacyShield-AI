/**
 * PrivacyShield AI — Settings Page Controller
 *
 * Manages user profile selection, loads and stores policy settings
 * in chrome.storage.sync (with local fallback), and queries active tab
 * domain context to reflect real-time policy overrides.
 */

import type { ActiveProfile, PolicyConfig, PolicyDecision } from '../types/policy';
import { STORAGE_KEY_POLICY } from '../services/PolicyEngine';

let currentSelectedProfile: ActiveProfile = 'balanced';

// DOM elements
const cards = document.querySelectorAll<HTMLElement>('.profile-card');
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const statusToast = document.getElementById('statusToast') as HTMLElement;
const activeShieldIcon = document.getElementById('activeShieldIcon') as HTMLElement;
const currentPolicyHeadline = document.getElementById('currentPolicyHeadline') as HTMLElement;
const currentPolicySub = document.getElementById('currentPolicySub') as HTMLElement;
const activeRiskPill = document.getElementById('activeRiskPill') as HTMLElement;

// Initialize Options UI
async function init(): Promise<void> {
  // 1. Load saved config
  const storageArea = chrome.storage?.sync || chrome.storage?.local;
  if (storageArea) {
    storageArea.get([STORAGE_KEY_POLICY], (result) => {
      const config: Partial<PolicyConfig> = result?.[STORAGE_KEY_POLICY] || {};
      if (config.activeProfile) {
        selectCard(config.activeProfile);
      }
    });
  }

  // 2. Query active tab context to display live policy evaluation
  checkActiveTabContext();

  // 3. Card click handlers
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const profile = card.getAttribute('data-profile') as ActiveProfile;
      if (profile) {
        selectCard(profile);
      }
    });
  });

  // 4. Save button handler
  if (saveBtn) {
    saveBtn.addEventListener('click', savePreferences);
  }
}

function selectCard(profile: ActiveProfile): void {
  currentSelectedProfile = profile;
  cards.forEach((c) => {
    if (c.getAttribute('data-profile') === profile) {
      c.classList.add('selected');
    } else {
      c.classList.remove('selected');
    }
  });
  updateContextIndicator(profile);
}

function updateContextIndicator(profile: ActiveProfile, domainDecision?: PolicyDecision): void {
  if (domainDecision?.domainOverrideActive) {
    activeShieldIcon.textContent = '🚨';
    activeShieldIcon.classList.add('high-risk');
    currentPolicyHeadline.textContent = `Strict Override: ${domainDecision.reasons[0] || 'Sensitive Domain'}`;
    currentPolicySub.textContent = `Route: Local SLM only • Redaction: Extreme • Mandatory Approval`;
    activeRiskPill.textContent = 'High Security Override';
    activeRiskPill.className = 'badge-pill danger';
    return;
  }

  activeShieldIcon.textContent = '🛡️';
  activeShieldIcon.classList.remove('high-risk');
  activeRiskPill.className = 'badge-pill';

  if (profile === 'strict') {
    currentPolicyHeadline.textContent = 'Active Policy: Maximum Security (Strict)';
    currentPolicySub.textContent = 'Zero outbound data • Local SLM only • Extreme visual redaction';
    activeRiskPill.textContent = 'Strict Enforced';
  } else if (profile === 'balanced') {
    currentPolicyHeadline.textContent = 'Active Policy: Balanced (Recommended)';
    currentPolicySub.textContent = 'Reasoning Cloud VLM permitted • Standard PII redaction • Form gate';
    activeRiskPill.textContent = 'Standard Security';
  } else {
    currentPolicyHeadline.textContent = 'Active Policy: Speed (Performance)';
    currentPolicySub.textContent = 'Ultra-fast Cloud VLM • Minimal redaction • Destructive actions protected';
    activeRiskPill.textContent = 'High Performance';
  }
}

async function checkActiveTabContext(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    if (currentTab?.url) {
      chrome.runtime.sendMessage(
        { type: 'GET_POLICY_DECISION', url: currentTab.url },
        (response: { decision?: PolicyDecision } | undefined) => {
          if (response?.decision) {
            updateContextIndicator(currentSelectedProfile, response.decision);
          }
        }
      );
    }
  } catch {
    // Context check fallback
  }
}

async function savePreferences(): Promise<void> {
  const storageArea = chrome.storage?.sync || chrome.storage?.local;
  if (!storageArea) return;

  storageArea.get([STORAGE_KEY_POLICY], (result) => {
    const existing: Partial<PolicyConfig> = result?.[STORAGE_KEY_POLICY] || {};
    const updated: PolicyConfig = {
      activeProfile: currentSelectedProfile,
      domainOverrides: existing.domainOverrides || [],
      taskHeuristics: existing.taskHeuristics || [],
      lastUpdated: Date.now(),
    };

    storageArea.set({ [STORAGE_KEY_POLICY]: updated }, () => {
      // Also write to local storage
      if (chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEY_POLICY]: updated });
      }

      if (statusToast) {
        statusToast.style.display = 'inline';
        setTimeout(() => {
          statusToast.style.display = 'none';
        }, 2500);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
