// dok 12 §29 "A06" section 8 ("Preview desktop/mobile") / §31 "A09"
// ("Student preview di tengah") - QST-003.
//
// `QuestionPreviewCardProps` intentionally does NOT import
// `StudentFacingQuestionView` from `@superlatif/domain/exam` - the
// workspace-boundary rule (`scripts/check-workspace-boundaries.mjs`) only
// allows `packages/ui` to depend on `@superlatif/contracts`, keeping this
// package presentation-only. The type below is written to match that
// domain type's SHAPE structurally; the caller (an `apps/web` route, which
// CAN depend on `@superlatif/domain`) passes a real
// `StudentFacingQuestionView` value straight through - TypeScript's
// structural typing accepts it without any runtime conversion, and no
// second serializer is invented here to bridge the gap.
//
// Every input is `disabled`/`readOnly` - this is a PREVIEW, not an
// answerable surface (dok 12 A06 §8 is explicit that this section is
// read-only). No answer-key/weight/correctness indicator is rendered
// anywhere, because none exists on this type to render - the same
// structural no-leak guarantee `toStudentFacingQuestionView` already
// provides one layer down.

export interface QuestionPreviewOption {
  readonly optionCode: string;
  readonly order: number;
  readonly content: Record<string, unknown>;
}

export interface QuestionPreviewAsset {
  readonly placement: string;
  readonly optionCode: string | null;
  readonly altText: string | null;
  readonly imagePurpose: string;
  readonly assetId: string;
}

export interface QuestionPreviewStimulus {
  readonly stimulusCode: string;
  readonly version: number;
  readonly bodyDocument: Record<string, unknown>;
}

export type QuestionPreviewResponseKind = "single_choice" | "multiple_choice" | "true_false" | "numeric";

export interface QuestionPreviewData {
  readonly questionCode: string;
  readonly version: number;
  readonly responseKind: QuestionPreviewResponseKind;
  readonly stimulus: QuestionPreviewStimulus | null;
  readonly stemDocument: Record<string, unknown>;
  readonly options: readonly QuestionPreviewOption[];
  readonly assets: readonly QuestionPreviewAsset[];
}

export interface QuestionPreviewCardProps {
  readonly question: QuestionPreviewData;
}

function documentText(document: Record<string, unknown>): string {
  const text = document["text"];
  return typeof text === "string" ? text : "";
}

function assetsFor(assets: readonly QuestionPreviewAsset[], placement: string, optionCode: string | null) {
  return assets.filter((asset) => asset.placement === placement && asset.optionCode === optionCode);
}

function AssetPlaceholder({ asset }: { readonly asset: QuestionPreviewAsset }) {
  // No real object-storage/CDN resolution happens in this task (`assetId`
  // is opaque) - the preview renders what IS safe to show now: the alt
  // text a reviewer needs to judge "media terbaca" (dok 12 §31 checklist).
  return (
    <div
      className={`slf-question-preview__asset slf-question-preview__asset--${asset.imagePurpose}`}
      role="img"
      aria-label={asset.altText ?? "Gambar tanpa deskripsi alternatif"}
    >
      <span aria-hidden="true">🖼</span>
      <span className="slf-question-preview__asset-alt">
        {asset.altText ?? (asset.imagePurpose === "decorative" ? "(dekoratif)" : "⚠ Alt text belum diisi")}
      </span>
    </div>
  );
}

export function QuestionPreviewCard({ question }: QuestionPreviewCardProps) {
  const stemAssets = assetsFor(question.assets, "stem", null);
  const explanationAssets = assetsFor(question.assets, "explanation", null);
  const stimulusAssets = question.assets.filter((asset) => asset.placement === "stimulus_body");

  return (
    <article className="slf-question-preview" aria-label={`Preview soal ${question.questionCode}`}>
      {question.stimulus ? (
        <section className="slf-question-preview__stimulus">
          <p className="slf-question-preview__stimulus-label">Bacaan · {question.stimulus.stimulusCode}</p>
          <p>{documentText(question.stimulus.bodyDocument)}</p>
          {stimulusAssets.map((asset) => (
            <AssetPlaceholder key={asset.assetId} asset={asset} />
          ))}
        </section>
      ) : null}

      <p className="slf-question-preview__stem">{documentText(question.stemDocument)}</p>
      {stemAssets.map((asset) => (
        <AssetPlaceholder key={asset.assetId} asset={asset} />
      ))}

      {question.responseKind === "numeric" ? (
        <div className="slf-question-preview__numeric">
          <label htmlFor={`preview-numeric-${question.questionCode}`}>Jawaban</label>
          <input
            id={`preview-numeric-${question.questionCode}`}
            type="number"
            disabled
            readOnly
            placeholder="..."
          />
        </div>
      ) : question.responseKind === "true_false" ? (
        <div className="slf-question-preview__options" role="group" aria-label="Pernyataan">
          {question.options.map((statement) => (
            <div key={statement.optionCode} className="slf-question-preview__statement">
              <p>{documentText(statement.content)}</p>
              <div className="slf-question-preview__statement-choices">
                <label>
                  <input
                    type="radio"
                    name={`preview-tf-${question.questionCode}-${statement.optionCode}`}
                    disabled
                    readOnly
                  />
                  Benar
                </label>
                <label>
                  <input
                    type="radio"
                    name={`preview-tf-${question.questionCode}-${statement.optionCode}`}
                    disabled
                    readOnly
                  />
                  Salah
                </label>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="slf-question-preview__options" role="group" aria-label="Pilihan jawaban">
          {question.options.map((option) => (
            <label key={option.optionCode} className="slf-question-preview__option">
              <input
                type={question.responseKind === "multiple_choice" ? "checkbox" : "radio"}
                name={`preview-${question.questionCode}`}
                disabled
                readOnly
              />
              <span>{documentText(option.content)}</span>
              {assetsFor(question.assets, "option", option.optionCode).map((asset) => (
                <AssetPlaceholder key={asset.assetId} asset={asset} />
              ))}
            </label>
          ))}
        </div>
      )}

      {explanationAssets.length > 0 ? (
        <section className="slf-question-preview__explanation-media">
          {explanationAssets.map((asset) => (
            <AssetPlaceholder key={asset.assetId} asset={asset} />
          ))}
        </section>
      ) : null}
    </article>
  );
}
