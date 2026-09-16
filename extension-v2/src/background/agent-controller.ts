/**
 * VisionLite AI v2 — Agent Controller
 *
 * Connects the secure local extension environment to the cloud AI Brain (FastAPI).
 * Takes the redacted screenshot and DOM snapshot, sends them to the server,
 * and returns the AI's reasoned ActionCommand.
 */

import type { DOMSnapshot, ActionCommand, AgentStateUpdateMsg } from '../types/messages';
import { PrivacyGate } from '../core/privacy-gate';

const SERVER_URL = 'http://localhost:8000';
const privacyGate = new PrivacyGate();

interface AnalyzePayload {
  redacted_screenshot: string;
  page_structure: DOMSnapshot;
  task: string;
}

interface AnalyzeResponse {
  understanding: string;
  action: ActionCommand;
  confidence: number;
}

export class AgentController {
  private isProcessing = false;

  /**
   * Sends the redacted screen and DOM to the server to get the next action.
   */
  async getNextAction(
    task: string,
    redactedScreenshot: string,
    domSnapshot: DOMSnapshot
  ): Promise<AnalyzeResponse | null> {
    if (this.isProcessing) {
      console.warn('[VisionLite:Agent] Already processing, skipping cycle.');
      return null;
    }

    this.isProcessing = true;
    this.broadcastState(task, 'analyzing', undefined);

    try {
      const payload: AnalyzePayload = {
        task,
        redacted_screenshot: redactedScreenshot,
        page_structure: domSnapshot,
      };

      // ── PRIVACY GATE (Fail-Closed Outbound Firewall) ──
      const gateResult = privacyGate.scan(payload, 'AnalyzePayload');
      if (!gateResult.allowed) {
        console.error('[VisionLite:Agent] Privacy Gate BLOCKED outbound transmission:', gateResult.summary);
        this.broadcastState(
          task,
          'error',
          undefined,
          undefined,
          `Privacy Gate Blocked: Sensitive data detected in outbound payload (${gateResult.violations.map(v => v.type).join(', ')})`
        );
        return null;
      }

      // [DEBUG] Broadcast payload to Debug View split-screen
      chrome.runtime.sendMessage({
        type: 'DEBUG_PAYLOAD',
        payload: {
          imageBase64: redactedScreenshot,
          domState: domSnapshot
        }
      }).catch(() => { /* debug page might not be open */ });

      console.log('[VisionLite:Agent] Sending data to AI Server...');
      const startTime = performance.now();
      const response = await fetch(`${SERVER_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data: AnalyzeResponse = await response.json();
      const cloudLatencyMs = Math.round(performance.now() - startTime);
      console.log(`[VisionLite:Agent] AI Response in ${cloudLatencyMs}ms:`, data);

      this.broadcastState(task, 'executing', data.understanding, `Will ${data.action.action} ${data.action.target || ''}`, undefined, { cloudLatencyMs });
      return data;
    } catch (error: any) {
      console.error('[VisionLite:Agent] Analysis failed:', error);
      this.broadcastState(task, 'error', undefined, undefined, error.message);
      return null;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Broadcasts the current state of the agent to the Side Panel UI.
   */
  broadcastState(
    task: string | null,
    status: 'idle' | 'analyzing' | 'executing' | 'done' | 'error',
    reasoning?: string,
    actionDescription?: string,
    error?: string,
    metrics?: { localLatencyMs?: number; piiCount?: number; cloudLatencyMs?: number }
  ): void {
    const msg: AgentStateUpdateMsg = {
      type: 'AGENT_STATE_UPDATE',
      task,
      status,
      reasoning,
      actionDescription,
      error,
      metrics,
    };
    chrome.runtime.sendMessage(msg).catch(() => {
      // Side panel might be closed
    });
  }
}

