/**
 * fileProcessor.ts
 * Handles local file reading and conversion for Gemini multimodal payloads.
 */

import type { ChatPart } from "./geminiClient";

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

const AUDIO_TYPES: Record<string, string> = {
  "audio/wav": "audio/wav",
  "audio/mp3": "audio/mp3",
  "audio/mpeg": "audio/mpeg",
  "audio/aac": "audio/aac",
  "audio/ogg": "audio/ogg",
  "audio/flac": "audio/flac",
  "audio/m4a": "audio/mp4",
  "audio/mp4": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/webm": "audio/webm",
};

const TEXT_EXTENSIONS = /\.(txt|csv|md|markdown|json|ts|tsx|js|jsx|css|html|htm|xml|yaml|yml|toml|py|rs|go|java|c|cpp|h|cs|sql|sh|ps1|bat|log|ini|env)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|flac|aac|m4a|webm)$/i;

export function isTextOrCodeFile(file: File): boolean {
  return (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    TEXT_EXTENSIONS.test(file.name)
  );
}

export function isDocxFile(file: File): boolean {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(file.name)
  );
}

export function requiresGeminiFileApi(file: File): boolean {
  return (
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/") ||
    file.type === "application/pdf" ||
    /\.(mp3|wav|ogg|flac|aac|m4a|mp4|webm|pdf)$/i.test(file.name)
  );
}

export async function mediaFileToPart(file: File): Promise<ChatPart> {
  return new Promise((resolve, reject) => {
    if (!IMAGE_TYPES[file.type] && !AUDIO_TYPES[file.type] && !AUDIO_EXTENSIONS.test(file.name)) {
      reject(new Error(`Unsupported media type: ${file.type || file.name}`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      let mime = IMAGE_TYPES[file.type] || AUDIO_TYPES[file.type] || file.type;
      if (!mime) {
        if (/\.mp3$/i.test(file.name)) mime = "audio/mp3";
        else if (/\.wav$/i.test(file.name)) mime = "audio/wav";
        else if (/\.m4a$/i.test(file.name)) mime = "audio/mp4";
        else mime = "application/octet-stream";
      }
      resolve({ inlineData: { mimeType: mime, data: base64 } });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Convert any plain-text, CSV, Markdown, or source code file to a text ChatPart. */
export async function textFileToPart(file: File): Promise<ChatPart> {
  return new Promise((resolve, reject) => {
    if (!isTextOrCodeFile(file)) {
      reject(new Error(`Unsupported text type: ${file.type || file.name}`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      resolve({ text: `--- Attached file: ${file.name} ---\n\n${content}` });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Extract readable text from a .docx ZIP archive using native Web APIs. */
export async function docxFileToPart(file: File): Promise<ChatPart> {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const decoder = new TextDecoder("utf-8");

  // Locate Central Directory entries (signature 0x02014b50) to find word/document.xml
  let docXmlBytes: Uint8Array | null = null;
  for (let i = 0; i < bytes.length - 46; i++) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x01 &&
      bytes[i + 3] === 0x02
    ) {
      const method = view.getUint16(i + 10, true);
      const compSize = view.getUint32(i + 20, true);
      const nameLen = view.getUint16(i + 28, true);
      const extraLen = view.getUint16(i + 30, true);
      const commentLen = view.getUint16(i + 32, true);
      const localOffset = view.getUint32(i + 42, true);
      const entryName = decoder.decode(bytes.subarray(i + 46, i + 46 + nameLen));

      if (entryName === "word/document.xml") {
        const localNameLen = view.getUint16(localOffset + 26, true);
        const localExtraLen = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const compressedSlice = bytes.subarray(dataStart, dataStart + compSize);

        if (method === 0) {
          docXmlBytes = compressedSlice;
        } else if (method === 8) {
          const ds = new DecompressionStream("deflate-raw");
          const writer = ds.writable.getWriter();
          writer.write(compressedSlice);
          writer.close();
          const decompressedBuf = await new Response(ds.readable).arrayBuffer();
          docXmlBytes = new Uint8Array(decompressedBuf);
        }
        break;
      }
      i += 45 + nameLen + extraLen + commentLen;
    }
  }

  if (!docXmlBytes) {
    throw new Error(`Could not extract text from ${file.name} (invalid .docx archive).`);
  }

  const xmlText = decoder.decode(docXmlBytes);
  const paragraphs = xmlText
    .split(/<\/w:p>/g)
    .map((p) => {
      const matches = Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g));
      return matches
        .map((m) =>
          m[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
        )
        .join("");
    })
    .filter((line) => line.trim().length > 0);

  return {
    text: `--- Attached DOCX file: ${file.name} ---\n\n${paragraphs.join("\n\n")}`,
  };
}

export async function processFile(file: File): Promise<ChatPart[]> {
  if (isDocxFile(file)) {
    return [await docxFileToPart(file)];
  }
  if (isTextOrCodeFile(file)) {
    return [await textFileToPart(file)];
  }
  if (IMAGE_TYPES[file.type] || AUDIO_TYPES[file.type] || AUDIO_EXTENSIONS.test(file.name)) {
    return [await mediaFileToPart(file)];
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}

/** Thumbnail URL for preview strip (images only). */
export function getPreviewUrl(file: File): string | null {
  if (IMAGE_TYPES[file.type]) return URL.createObjectURL(file);
  return null;
}
