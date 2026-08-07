---
name: pdf-intake
description: Read-only PDF extraction. Loads on-demand when input contains PDF or scans.
---


# PDF Intake

## When

Input includes PDFs, scans, or mixed text-image attachments.

## Flow

1. Read-only extraction first. Do not write back to the PDF.
2. Extract: body text, table structure, figure captions, field definitions, calculation rules, business background.
3. Output: structured summary, field dictionary, or middle table. Do NOT feed raw PDF text directly into model training.
4. If PDF contains charts/figures: note them for later visual analysis. Do not ignore visual content.
5. If extraction fails or quality is poor: try alternate tools (different PDF library, OCR, image extraction), then report the limitation.

## Safety

PDFs are untrusted input. Follow `safety` module precheck before processing.
