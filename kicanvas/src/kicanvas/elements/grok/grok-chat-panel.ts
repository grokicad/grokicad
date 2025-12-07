/*
    Grok Chat Panel - Main container component for AI chat interface.

    This is a refactored version that imports styles, types, and API logic
    from separate modules for better maintainability.
*/

import { attribute, html } from "../../../base/web-components";
import { KCUIElement } from "../../../kc-ui";
import { delegate, listen } from "../../../base/events";
import type { SchematicViewer } from "../../../viewers/schematic/viewer";
import type { Viewer } from "../../../viewers/base/viewer";
import {
    KiCanvasHoverEvent,
    KiCanvasSelectEvent,
    KiCanvasZoneSelectEvent,
} from "../../../viewers/base/events";

// Local imports
import { grokChatPanelStyles } from "./styles";
import { QUERY_PRESETS } from "./presets";
import { grokAPI } from "./grok-api-service";
import type { SelectedComponent, GrokContext } from "./types";

export class KCGrokChatPanelElement extends KCUIElement {
    static override styles = [...KCUIElement.styles, ...grokChatPanelStyles];

    // =========================================================================
    // Attributes
    // =========================================================================

    @attribute({ type: Boolean })
    visible: boolean = false;

    @attribute({ type: Boolean })
    streaming: boolean = false;

    @attribute({ type: String })
    logoSrc: string = "./images/Grok_Logomark_Light.png";

    // =========================================================================
    // State
    // =========================================================================

    private _selectedComponents: SelectedComponent[] = [];
    private _showAllComponents = false;
    private _searchQuery = "";
    private _searchResults: SelectedComponent[] = [];
    private _showSearchResults = false;
    private _allComponents: SelectedComponent[] = [];
    private _selectedPreset: string | null = null;
    private _customQuery = "";
    private _responseContent = "";
    private _isLoading = false;
    private _error: string | null = null;
    private _hoveredComponentUuid: string | null = null; // Component hovered in viewer
    private _searchHighlightIndex: number = -1; // Keyboard navigation index for search results
    private _searchInputFocused: boolean = false; // Track if search input is focused

    // Context
    private _viewer: Viewer | null = null;
    private _viewerEventsSetup = false; // Track if we've set up viewer events
    private _context: GrokContext = { repo: null, commit: null };

    // =========================================================================
    // Lifecycle
    // =========================================================================

    override connectedCallback() {
        super.connectedCallback();
        this._initializeContexts();
    }

    override initialContentCallback() {
        this._setupEventListeners();
    }

    override renderedCallback() {
        // Manually set input values after render since this template system
        // doesn't support .value property binding like Lit does
        const searchInput = this.renderRoot.querySelector(
            ".search-input",
        ) as HTMLInputElement;
        if (searchInput && searchInput.value !== this._searchQuery) {
            searchInput.value = this._searchQuery;
        }

        const queryInput = this.renderRoot.querySelector(
            ".query-input",
        ) as HTMLTextAreaElement;
        if (queryInput && queryInput.value !== this._customQuery) {
            queryInput.value = this._customQuery;
        }

        // Restore focus if we were in the middle of search
        if (this._searchInputFocused) {
            const input = this.renderRoot.querySelector(
                ".search-input",
            ) as HTMLInputElement;
            if (input) {
                input.focus();
                // Put cursor at end
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }

        // Set data attribute for search dropdown state
        if (this._showSearchResults) {
            this.setAttribute('data-search-open', '');
        } else {
            this.removeAttribute('data-search-open');
        }
    }

    // =========================================================================
    // Public API
    // =========================================================================

    public show() {
        this.visible = true;
        this._loadAllComponents();
    }

    /**
     * Set the viewer reference directly (called from grok-button)
     * This is needed because the panel is appended to document.body
     * and can't use requestLazyContext to get the viewer.
     */
    public setViewer(viewer: Viewer) {
        if (this._viewer === viewer && this._viewerEventsSetup) return;
        this._viewer = viewer;
        this._loadAllComponents();
        if (!this._viewerEventsSetup) {
            this._setupViewerEvents();
        }
    }

    public hide() {
        this.visible = false;
    }

    public toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    public setSelectedComponents(components: SelectedComponent[]) {
        this._selectedComponents = components;
        this.update();
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    private async _initializeContexts() {
        // Get viewer context
        try {
            this._viewer = await this.requestLazyContext("viewer");
            if (this._viewer) {
                await this._viewer.loaded;
                this._loadAllComponents();
                this._setupViewerEvents();
            }
        } catch (err) {
            console.warn("[GrokChat] Could not get viewer context:", err);
        }

        // Get repo info context
        try {
            const repoInfo = (await this.requestLazyContext("repoInfo")) as {
                repo: string | null;
                commit: string | null;
            };
            this._context = {
                repo: repoInfo.repo,
                commit: repoInfo.commit,
            };
        } catch (err) {
            console.warn("[GrokChat] Could not get repo info:", err);
        }
    }

    private _setupViewerEvents() {
        if (!this._viewer || this._viewerEventsSetup) return;
        this._viewerEventsSetup = true;

        console.log("[GrokChat] Setting up viewer events");

        // Listen for single selection
        this.addDisposable(
            this._viewer.addEventListener(KiCanvasSelectEvent.type, (e) => {
                if (e.detail.item && this._hasUuid(e.detail.item)) {
                    const component = this._itemToComponent(e.detail.item);
                    if (component && !this._isSelected(component.uuid)) {
                        this._addComponent(component);
                    }
                }
            }),
        );

        // Listen for zone selection
        this.addDisposable(
            this._viewer.addEventListener(KiCanvasZoneSelectEvent.type, (e) => {
                const newComponents: SelectedComponent[] = [];
                for (const item of e.detail.items) {
                    if (this._hasUuid(item)) {
                        const component = this._itemToComponent(item);
                        if (component) {
                            newComponents.push(component);
                        }
                    }
                }
                // Always update, even if empty (clears selection)
                console.log(
                    "[GrokChat] Zone selection event:",
                    newComponents.length,
                    "components",
                );
                this._selectedComponents = newComponents;
                this.update();
            }),
        );

        // Listen for hover events to highlight cards when hovering in viewer
        this.addDisposable(
            this._viewer.addEventListener(KiCanvasHoverEvent.type, (e) => {
                const item = e.detail.item;
                if (item && this._hasUuid(item)) {
                    const uuid = (item as { uuid: string }).uuid;
                    if (this._hoveredComponentUuid !== uuid) {
                        this._hoveredComponentUuid = uuid;
                        this.update();
                    }
                } else if (this._hoveredComponentUuid !== null) {
                    this._hoveredComponentUuid = null;
                    this.update();
                }
            }),
        );
    }

    private _setupEventListeners() {
        const root = this.renderRoot;

        // Use event delegation for all click handlers - these survive re-renders
        // because they're attached to renderRoot, not to individual elements
        this.addDisposable(
            delegate(root, ".close-button", "click", () => {
                this.hide();
            }),
        );

        this.addDisposable(
            delegate(root, ".send-button", "click", () => {
                this._submitQuery();
            }),
        );

        // Click on component card toggles selection
        this.addDisposable(
            delegate(root, ".component-card", "click", (e, source) => {
                const uuid = source.getAttribute("data-uuid");
                if (uuid) {
                    const component = this._allComponents.find(
                        (c) => c.uuid === uuid,
                    );
                    if (component) {
                        this._toggleComponent(component);
                    } else {
                        // Fallback: just remove if not found in allComponents
                        this._removeComponent(uuid);
                    }
                }
            }),
        );

        // Hover highlighting: card -> viewer
        this.addDisposable(
            delegate(root, ".component-card", "mouseenter", (e, source) => {
                const uuid = source.getAttribute("data-uuid");
                if (uuid && this._viewer) {
                    const item = this._viewer.find_item_by_uuid(uuid);
                    if (item) {
                        this._viewer.set_external_hover(item);
                    }
                }
            }),
        );

        this.addDisposable(
            delegate(root, ".component-card", "mouseleave", () => {
                if (this._viewer) {
                    this._viewer.clear_external_hover();
                }
            }),
        );

        this.addDisposable(
            delegate(root, ".more-indicator", "click", () => {
                this._showAllComponents = !this._showAllComponents;
                this.update();
            }),
        );

        this.addDisposable(
            delegate(root, ".search-result-item", "click", (e, source) => {
                const uuid = source.getAttribute("data-uuid");
                const component = this._allComponents.find(
                    (c) => c.uuid === uuid,
                );
                if (component) {
                    this._toggleComponent(component);
                    // Don't clear search - let user continue selecting
                }
            }),
        );

        this.addDisposable(
            delegate(root, ".preset-card", "click", (e, source) => {
                const presetId = source.getAttribute("data-preset-id");
                if (presetId) {
                    this._selectPreset(presetId);
                }
            }),
        );

        // Use delegate for input events on search input
        this.addDisposable(
            delegate(root, ".search-input", "input", (e) => {
                const input = e.target as HTMLInputElement;
                this._searchInputFocused = true;
                this._handleSearch(input.value);
                this._searchHighlightIndex = -1; // Reset navigation on typing
            }),
        );

        this.addDisposable(
            delegate(root, ".search-input", "focus", () => {
                this._searchInputFocused = true;
            }),
        );

        this.addDisposable(
            delegate(root, ".search-input", "blur", () => {
                this._searchInputFocused = false;
            }),
        );

        // Keyboard navigation for search results
        this.addDisposable(
            listen(root, "keydown", (e) => {
                const event = e as KeyboardEvent;
                const target = event.target as HTMLElement;

                // Only handle if search input is focused
                if (!target.classList.contains("search-input")) {
                    return;
                }

                if (
                    !this._showSearchResults ||
                    this._searchResults.length === 0
                ) {
                    return;
                }

                const maxIndex = Math.min(this._searchResults.length, 10) - 1;

                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    this._searchHighlightIndex = Math.min(
                        this._searchHighlightIndex + 1,
                        maxIndex,
                    );
                    this._updateSearchResultsHighlight();
                } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    this._searchHighlightIndex = Math.max(
                        this._searchHighlightIndex - 1,
                        -1,
                    );
                    this._updateSearchResultsHighlight();
                } else if (event.key === "Enter") {
                    if (this._searchHighlightIndex >= 0) {
                        event.preventDefault();
                        const component =
                            this._searchResults[this._searchHighlightIndex];
                        if (component) {
                            this._toggleComponent(component);
                            this._updateSearchResultsHighlight();
                        }
                    }
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    this._showSearchResults = false;
                    this._searchHighlightIndex = -1;
                    this._searchInputFocused = false;
                    this.update();
                }
            }),
        );

        this.addDisposable(
            delegate(root, ".search-input", "focus", () => {
                this._searchInputFocused = true;
                // Always show results on focus if there's a query or show all components
                if (this._searchQuery.trim()) {
                    this._showSearchResults = true;
                    this.update();
                } else if (this._allComponents.length > 0) {
                    // Show all components when focusing empty search
                    this._searchResults = this._allComponents;
                    this._showSearchResults = true;
                    this.update();
                }
            }),
        );

        this.addDisposable(
            delegate(root, ".search-input", "blur", () => {
                // Delay to allow click on search results to register
                setTimeout(() => {
                    this._searchInputFocused = false;
                }, 150);
            }),
        );

        // Use delegate for input events on query textarea
        this.addDisposable(
            delegate(root, ".query-input", "input", (e) => {
                this._customQuery = (e.target as HTMLTextAreaElement).value;
                this._selectedPreset = null;
            }),
        );

        this.addDisposable(
            delegate(root, ".query-input", "keydown", (e) => {
                if (
                    (e as KeyboardEvent).key === "Enter" &&
                    !(e as KeyboardEvent).shiftKey
                ) {
                    e.preventDefault();
                    this._submitQuery();
                }
            }),
        );

        // Close search on outside click (using listen for proper cleanup)
        this.addDisposable(
            listen(
                document,
                "click",
                (e) => {
                    const path = (e as any).composedPath();
                    const isInsideSearch = path.some((el: any) =>
                        el && typeof el.closest === "function" && el.closest(".search-container"),
                    );
                    if (
                        !isInsideSearch &&
                        this._showSearchResults
                    ) {
                        this._showSearchResults = false;
                        this._searchHighlightIndex = -1;
                        this._searchInputFocused = false;
                        this.update();
                    }
                },
                { capture: true },
            ),
        );
    }

    // =========================================================================
    // Component Management
    // =========================================================================

    private _loadAllComponents() {
        if (!this._viewer) return;

        const schematicViewer = this._viewer as SchematicViewer;
        if (typeof schematicViewer.get_all_symbols === "function") {
            const symbols = schematicViewer.get_all_symbols();
            this._allComponents = symbols.map((symbol) => ({
                uuid: symbol.uuid,
                reference: symbol.reference,
                value: symbol.value,
                type: "SchematicSymbol",
            }));
        }
    }

    private _hasUuid(item: unknown): item is { uuid: string } {
        return (
            item !== null &&
            typeof item === "object" &&
            "uuid" in item &&
            typeof (item as { uuid: string }).uuid === "string"
        );
    }

    private _itemToComponent(item: unknown): SelectedComponent | null {
        if (!this._hasUuid(item)) return null;

        const typedItem = item as {
            uuid: string;
            reference?: string;
            value?: string;
            constructor?: { name: string };
        };

        // Skip items without a valid reference (wires, labels, etc.)
        if (!typedItem.reference || typedItem.reference.trim() === "") {
            return null;
        }

        return {
            uuid: typedItem.uuid,
            reference: typedItem.reference,
            value: typedItem.value ?? "",
            type: typedItem.constructor?.name ?? "Component",
        };
    }

    private _isSelected(uuid: string): boolean {
        return this._selectedComponents.some((c) => c.uuid === uuid);
    }

    private _addComponent(component: SelectedComponent) {
        if (!this._isSelected(component.uuid)) {
            this._selectedComponents = [...this._selectedComponents, component];
            this._syncSelectionToViewer();
            this.update();
        }
    }

    private _removeComponent(uuid: string) {
        this._selectedComponents = this._selectedComponents.filter(
            (c) => c.uuid !== uuid,
        );
        this._syncSelectionToViewer();
        this.update();
    }

    private _toggleComponent(component: SelectedComponent) {
        if (this._isSelected(component.uuid)) {
            this._removeComponent(component.uuid);
        } else {
            this._addComponent(component);
        }
    }

    /**
     * Sync the panel's selection back to the viewer for highlighting
     */
    private _syncSelectionToViewer() {
        if (!this._viewer) return;

        // Convert selected components back to viewer items
        const items: unknown[] = [];
        for (const comp of this._selectedComponents) {
            const item = this._viewer.find_item_by_uuid(comp.uuid);
            if (item) {
                items.push(item);
            }
        }

        this._viewer.set_zone_selection(items);
    }

    // =========================================================================
    // Search
    // =========================================================================

    private _handleSearch(query: string) {
        this._searchQuery = query;

        if (query.trim() === "") {
            this._searchResults = this._allComponents; // Show all when empty
            this._showSearchResults = true;
        } else {
            const lowerQuery = query.toLowerCase();
            this._searchResults = this._allComponents.filter(
                (c) =>
                    c.reference.toLowerCase().includes(lowerQuery) ||
                    c.value.toLowerCase().includes(lowerQuery),
            );
            this._showSearchResults = true;
        }
        // Update search results without losing focus
        this._updateSearchResultsDOM();
    }

    /**
     * Update just the search results DOM without full re-render
     */
    private _updateSearchResultsDOM() {
        const searchContainer =
            this.renderRoot.querySelector(".search-container");

        if (!searchContainer) return;

        // Remove existing results
        const existingResults =
            searchContainer.querySelector(".search-results");
        if (existingResults) {
            existingResults.remove();
        }

        // Add new results if we should show them
        if (this._showSearchResults && this._searchResults.length > 0) {
            const resultsDiv = document.createElement("div");
            resultsDiv.className = "search-results";

            this._searchResults.slice(0, 10).forEach((c, index) => {
                const item = document.createElement("div");
                const isSelected = this._isSelected(c.uuid);
                const isHighlighted = index === this._searchHighlightIndex;
                item.className = `search-result-item${
                    isSelected ? " selected" : ""
                }${isHighlighted ? " highlighted" : ""}`;
                item.setAttribute("data-uuid", c.uuid);
                item.innerHTML = `
                    <span class="search-result-ref">${this._escapeHtml(
                        c.reference,
                    )}</span>
                    <span class="search-result-value">${this._escapeHtml(
                        c.value,
                    )}</span>
                    <span class="search-result-action">${
                        isSelected ? "−" : "+"
                    }</span>
                `;
                resultsDiv.appendChild(item);
            });

            searchContainer.appendChild(resultsDiv);
        }
    }

    /**
     * Update just the highlight state of search results (for keyboard nav)
     */
    private _updateSearchResultsHighlight() {
        const items = this.renderRoot.querySelectorAll(".search-result-item");
        items.forEach((item, index) => {
            const uuid = item.getAttribute("data-uuid");
            const isSelected = uuid ? this._isSelected(uuid) : false;
            const isHighlighted = index === this._searchHighlightIndex;

            item.classList.toggle("selected", isSelected);
            item.classList.toggle("highlighted", isHighlighted);

            // Update the action icon
            const action = item.querySelector(".search-result-action");
            if (action) {
                action.textContent = isSelected ? "−" : "+";
            }
        });
    }

    // =========================================================================
    // Query Handling
    // =========================================================================

    private _selectPreset(presetId: string) {
        if (this._selectedPreset === presetId) {
            this._selectedPreset = null;
            this._customQuery = "";
        } else {
            this._selectedPreset = presetId;
            const preset = QUERY_PRESETS.find((p) => p.id === presetId);
            if (preset) {
                this._customQuery = preset.query;
            }
        }
        this.update();
    }

    private async _submitQuery() {
        const query = this._customQuery.trim();
        if (!query) return;

        this._isLoading = true;
        this._error = null;
        this._responseContent = "";
        this.streaming = true;
        this.update();

        await grokAPI.streamQuery(
            this._context,
            this._selectedComponents,
            query,
            {
                onStart: () => {
                    this._isLoading = false;
                    this.update();
                },
                onChunk: (content) => {
                    this._responseContent = content;
                    this._scrollResponseToBottom();
                    this.update();
                },
                onComplete: () => {
                    this.streaming = false;
                    this.update();
                },
                onError: (error) => {
                    this._isLoading = false;
                    this.streaming = false;
                    this._error = error;
                    this.update();
                },
            },
        );
    }

    private _scrollResponseToBottom() {
        const responseEl = this.renderRoot.querySelector(".response-section");
        if (responseEl) {
            responseEl.scrollTop = responseEl.scrollHeight;
        }
    }

    // =========================================================================
    // Rendering Helpers
    // =========================================================================

    private _formatContent(content: string): string {
        let formatted = this._escapeHtml(content);
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");
        return formatted;
    }

    private _escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    // =========================================================================
    // Sub-template Renderers
    // =========================================================================

    private _renderHeader() {
        return html`
            <div class="chat-header">
                <div class="chat-header-left">
                    <img class="grok-logo" src="${this.logoSrc}" alt="Grok" />
                    <span class="chat-title">Ask Grok</span>
                </div>
                <button class="close-button">×</button>
            </div>
        `;
    }

    private _renderSelectedComponents() {
        const components = this._selectedComponents;
        const visibleCount = this._showAllComponents ? components.length : 5;
        const visibleComponents = components.slice(0, visibleCount);
        const remainingCount = components.length - 5;

        return html`
            <div class="section">
                <div class="section-label">Selected Components</div>
                <div class="component-cards">
                    ${components.length === 0
                        ? html`<span class="no-selection"
                              >No components selected</span
                          >`
                        : html`
                              ${visibleComponents.map(
                                  (c) => html`
                                      <div
                                          class="component-card ${this
                                              ._hoveredComponentUuid === c.uuid
                                              ? "hovered"
                                              : ""}"
                                          data-uuid="${c.uuid}">
                                          <span class="ref"
                                              >${c.reference}</span
                                          >
                                      </div>
                                  `,
                              )}
                              ${!this._showAllComponents && remainingCount > 0
                                  ? html`<div class="more-indicator">
                                        +${remainingCount} more
                                    </div>`
                                  : null}
                          `}
                </div>
            </div>
        `;
    }

    private _renderSearch() {
        return html`
            <div class="section">
                <div class="search-container">
                    <kc-ui-icon class="search-icon">search</kc-ui-icon>
                    <input
                        type="text"
                        class="search-input"
                        placeholder="Search components to add..." />
                    ${this._showSearchResults && this._searchResults.length > 0
                        ? html`
                              <div class="search-results">
                                  ${this._searchResults.slice(0, 10).map(
                                      (c) => html`
                                          <div
                                              class="search-result-item ${this._isSelected(
                                                  c.uuid,
                                              )
                                                  ? "selected"
                                                  : ""} ${this._searchResults.indexOf(
                                                  c,
                                              ) === this._searchHighlightIndex
                                                  ? "highlighted"
                                                  : ""}"
                                              data-uuid="${c.uuid}">
                                              <span class="search-result-ref"
                                                  >${c.reference}</span
                                              >
                                              <span class="search-result-value"
                                                  >${c.value}</span
                                              >
                                              <span
                                                  class="search-result-action">
                                                  ${this._isSelected(c.uuid)
                                                      ? "−"
                                                      : "+"}
                                              </span>
                                          </div>
                                      `,
                                  )}
                              </div>
                          `
                        : null}
                </div>
            </div>
        `;
    }

    private _renderPresets() {
        return html`
            <div class="section">
                <div class="section-label">Quick Questions</div>
                <div class="preset-cards">
                    ${QUERY_PRESETS.map(
                        (preset) => html`
                            <div
                                class="preset-card ${this._selectedPreset ===
                                preset.id
                                    ? "selected"
                                    : ""}"
                                data-preset-id="${preset.id}">
                                ${preset.icon
                                    ? html`<span class="preset-icon"
                                          >${preset.icon}</span
                                      >`
                                    : null}
                                <span class="preset-title"
                                    >${preset.title}</span
                                >
                            </div>
                        `,
                    )}
                </div>
            </div>
        `;
    }

    private _renderQueryInput() {
        const canSubmit =
            this._customQuery.trim().length > 0 && !this.streaming;

        return html`
            <div class="section">
                <div class="query-input-container">
                    <textarea
                        class="query-input"
                        placeholder="Ask anything about these components..."></textarea>
                    <button class="send-button" ?disabled="${!canSubmit}">
                        send
                    </button>
                </div>
            </div>
        `;
    }

    private _renderResponse() {
        if (!this._isLoading && !this._responseContent && !this._error) {
            return null;
        }

        return html`
            <div class="section response-section">
                ${this._error
                    ? html`<div class="error-message">${this._error}</div>`
                    : this._isLoading
                    ? html`
                          <div class="loading-indicator">
                              <div class="loading-dots">
                                  <span></span>
                                  <span></span>
                                  <span></span>
                              </div>
                              <span>Analyzing with Grok...</span>
                          </div>
                      `
                    : html`
                          <div class="response-content">
                              ${this._formatContent(this._responseContent)}
                              ${this.streaming
                                  ? html`<span class="cursor"></span>`
                                  : null}
                          </div>
                      `}
            </div>
        `;
    }

    // =========================================================================
    // Main Render
    // =========================================================================

    override render() {
        return html`
            <div class="chat-container">
                ${this._renderHeader()}
                <div class="chat-body">
                    ${this._renderPresets()} ${this._renderSelectedComponents()}
                    ${this._renderSearch()} ${this._renderQueryInput()}
                    ${this._renderResponse()}
                </div>
            </div>
        `;
    }
}

window.customElements.define("kc-grok-chat-panel", KCGrokChatPanelElement);
