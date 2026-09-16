/**
 * VisionLite AI — Chrome Extension API Type Declarations
 * 
 * Minimal ambient types for the Chrome extension APIs we use.
 * This avoids installing heavy third-party type packages.
 */

declare namespace chrome {
  // ---- Tabs ----
  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      active: boolean;
      windowId: number;
    }

    function captureVisibleTab(
      windowId: number | null,
      options: { format?: string; quality?: number }
    ): Promise<string>;

    function query(
      queryInfo: { active?: boolean; currentWindow?: boolean },
      callback: (tabs: Tab[]) => void
    ): void;

    function sendMessage(
      tabId: number,
      message: unknown,
      responseCallback?: (response: unknown) => void
    ): Promise<unknown>;

    function create(
      createProperties: { url: string; active?: boolean },
      callback?: (tab: Tab) => void
    ): void;
  }

  // ---- Runtime ----
  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
    }

    const lastError: { message?: string } | undefined;

    function sendMessage(
      message: unknown,
      responseCallback?: (response: unknown) => void
    ): Promise<unknown>;

    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: MessageSender,
          sendResponse: (response?: any) => void
        ) => boolean | void
      ): void;
    };

    function getURL(path: string): string;
  }

  // ---- Storage ----
  namespace storage {
    namespace local {
      function get(
        keys: string | string[],
        callback: (result: Record<string, any>) => void
      ): void;

      function set(items: Record<string, any>, callback?: () => void): void;

      function remove(keys: string | string[], callback?: () => void): void;
    }
  }

  // ---- Offscreen ----
  namespace offscreen {
    type Reason = 'WORKERS' | 'AUDIO_PLAYBACK' | 'DISPLAY_MEDIA' | 'DOM_PARSER'
      | 'DOM_SCRAPING' | 'BLOBS' | 'CLIPBOARD' | 'LOCAL_STORAGE'
      | 'GEOLOCATION' | 'MATCH_MEDIA' | 'TESTING' | 'USER_MEDIA' | 'WEB_RTC';

    function createDocument(params: {
      url: string;
      reasons: Reason[];
      justification: string;
    }): Promise<void>;

    function hasDocument(): Promise<boolean>;

    function closeDocument(): Promise<void>;
  }

  // ---- Side Panel ----
  namespace sidePanel {
    function open(options: { tabId: number }): Promise<void>;

    function setOptions(options: { enabled: boolean }): Promise<void>;
  }

  // ---- Notifications ----
  namespace notifications {
    function create(
      notificationId: string | undefined,
      options: {
        type: string;
        iconUrl: string;
        title: string;
        message: string;
      },
      callback?: (notificationId: string) => void
    ): void;
  }

  // ---- Runtime Install ----
  namespace runtime {
    const onInstalled: {
      addListener(
        callback: (details: { reason: string }) => void
      ): void;
    };
  }
}

