/*
    Markdown utilities for generating and downloading markdown files.
    Provides reusable functions for creating markdown content and triggering downloads.
*/

/**
 * Options for downloading content as a file
 */
export interface DownloadOptions {
    /** Filename (without extension) */
    filename: string;
    /** File extension (default: "md") */
    extension?: string;
    /** MIME type (default: "text/markdown") */
    mimeType?: string;
}

/**
 * Download content as a file to the user's computer
 * @param content - The content to download
 * @param options - Download configuration options
 */
export function downloadAsFile(content: string, options: DownloadOptions): void {
    const { filename, extension = "md", mimeType = "text/markdown" } = options;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${filename}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Sanitize a string for use in filenames
 * Replaces non-alphanumeric characters with hyphens
 */
export function sanitizeFilename(str: string): string {
    return str.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
}

/**
 * Get current date in YYYY-MM-DD format
 */
export function getDateStamp(): string {
    return new Date().toISOString().split("T")[0] ?? "";
}

/**
 * Builder class for creating markdown documents
 */
export class MarkdownBuilder {
    private lines: string[] = [];

    /**
     * Add a heading
     */
    heading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6 = 1): this {
        this.lines.push(`${"#".repeat(level)} ${text}`);
        this.lines.push("");
        return this;
    }

    /**
     * Add a paragraph
     */
    paragraph(text: string): this {
        this.lines.push(text);
        this.lines.push("");
        return this;
    }

    /**
     * Add bold key-value metadata line
     */
    metadata(key: string, value: string | null | undefined): this {
        if (value) {
            this.lines.push(`**${key}:** ${value}`);
        }
        return this;
    }

    /**
     * Add a horizontal rule
     */
    rule(): this {
        this.lines.push("");
        this.lines.push("---");
        this.lines.push("");
        return this;
    }

    /**
     * Add raw text/content
     */
    raw(content: string): this {
        this.lines.push(content);
        return this;
    }

    /**
     * Add a blank line
     */
    blank(): this {
        this.lines.push("");
        return this;
    }

    /**
     * Add italic text (e.g., for footer attribution)
     */
    italic(text: string): this {
        this.lines.push(`*${text}*`);
        this.lines.push("");
        return this;
    }

    /**
     * Build and return the final markdown string
     */
    build(): string {
        return this.lines.join("\n");
    }

    /**
     * Build and download as a file
     */
    download(options: DownloadOptions): void {
        downloadAsFile(this.build(), options);
    }
}


