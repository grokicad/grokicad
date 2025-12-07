/*
    Shared types for Grok chat components.
*/

/** Represents a selected schematic component */
export interface SelectedComponent {
    uuid: string;
    reference: string;
    value: string;
    type: string;
}

/** Suggested query preset */
export interface QueryPreset {
    id: string;
    title: string;
    icon: string;
    description: string;
    query: string;
}

/** State for the chat panel */
export interface GrokChatState {
    selectedComponents: SelectedComponent[];
    showAllComponents: boolean;
    searchQuery: string;
    searchResults: SelectedComponent[];
    showSearchResults: boolean;
    allComponents: SelectedComponent[];
    selectedPreset: string | null;
    customQuery: string;
    responseContent: string;
    isLoading: boolean;
    isStreaming: boolean;
    error: string | null;
}

/** Context information for API calls */
export interface GrokContext {
    repo: string | null;
    commit: string | null;
}

/** Events emitted by Grok sub-components */
export interface GrokComponentEvents {
    /** Fired when a component should be removed from selection */
    "grok-remove-component": { uuid: string };
    /** Fired when the "show more" button is toggled */
    "grok-toggle-show-all": void;
    /** Fired when a search result is clicked */
    "grok-select-search-result": { component: SelectedComponent };
    /** Fired when a preset card is clicked */
    "grok-select-preset": { presetId: string };
    /** Fired when the query should be submitted */
    "grok-submit-query": { query: string };
    /** Fired when the panel should close */
    "grok-close": void;
    /** Fired when search query changes */
    "grok-search": { query: string };
    /** Fired when custom query text changes */
    "grok-query-change": { query: string };
}

/** Helper type for creating typed custom events */
export type GrokCustomEvent<K extends keyof GrokComponentEvents> =
    CustomEvent<GrokComponentEvents[K]>;

/** Create a typed custom event */
export function createGrokEvent<K extends keyof GrokComponentEvents>(
    type: K,
    detail: GrokComponentEvents[K],
): GrokCustomEvent<K> {
    return new CustomEvent(type, {
        bubbles: true,
        composed: true,
        detail,
    });
}
