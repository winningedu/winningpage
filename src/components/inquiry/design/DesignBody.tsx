import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DesignView, TopicView } from "@/lib/inquiry/types";
import {
  buildChecklistRows,
  buildOverviewRows,
  groupSectionCards,
  SCORE_FORMULA,
  SOURCE_TABLE_NOTE,
} from "./designLogic";

// 설계 리포트 본문 렌더러. 설계 리포트 화면(3)과 보관함 상세가 같은 컴포넌트를 쓴다(계획서 §2 37).
// 마크다운은 렌더하지 않고 문자열 그대로 보여 준다. 계약: 부록 A DesignView.

type Props = {
  design: DesignView;
  topic: TopicView;
  /** 작성 화면 서랍처럼 좁은 곳에서 여백을 줄인다. */
  compact?: boolean | undefined;
};

const TH = "px-3 py-2 text-left text-app-label font-semibold text-ink-sub";
const TD = "px-3 py-2 align-top text-app-label text-ink-strong";

function Card({
  title,
  note,
  compact,
  children,
}: {
  title: string;
  note?: string;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`rounded-xl border border-line/60 bg-white ${compact ? "p-4" : "p-6"}`}
    >
      <h2 className="text-app-card-title font-bold text-ink-strong">{title}</h2>
      {note && <p className="mt-1 text-app-label text-ink-sub">{note}</p>}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Bulleted({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-app-label font-semibold text-ink-strong">{label}</p>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item} className="text-app-label text-ink-sub">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DesignBody({ design, compact = false }: Props) {
  const overviewRows = buildOverviewRows(design);
  const groups = groupSectionCards(design);
  const checklist = buildChecklistRows(design);
  const questions = design.interpretQuestions;
  const gap = compact ? "gap-3" : "gap-4";

  return (
    <div className={`flex flex-col ${gap}`}>
      <Card title="탐구 개요" compact={compact}>
        <Table aria-label="탐구 개요">
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>항목</TableHead>
              <TableHead className={TH}>내용</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overviewRows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className={`${TD} w-32 font-semibold`}>
                  {row.label}
                </TableCell>
                <TableCell className={TD}>
                  <span>{row.value}</span>
                  {row.badge && (
                    <span className="ml-2 rounded-full bg-surface-04 px-2 py-0.5 text-app-badge font-semibold">
                      {row.badge}
                    </span>
                  )}
                  {row.extra && (
                    <p className="mt-1 text-app-label text-ink-sub">
                      <span className="font-semibold">{row.extra.label}</span>
                      {` ${row.extra.value}`}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="rounded-lg bg-blue-50 px-4 py-3">
          <p className="text-app-label font-bold text-ink-strong">
            검증 가능성 점검
          </p>
          <p className="mt-0.5 text-app-label text-ink-sub">
            {design.verifiability}
          </p>
        </div>
        {design.reliabilityNotice && (
          <div role="note" className="rounded-lg bg-amber-50 px-4 py-3">
            <p className="text-app-label font-bold text-ink-strong">
              출발 활동 확인 요청
            </p>
            <p className="mt-0.5 text-app-label text-ink-sub">
              {design.reliabilityNotice}
            </p>
          </div>
        )}
      </Card>

      {groups.map((group) => (
        <section
          key={group.group}
          aria-labelledby={`design-group-${group.group}`}
          className={`rounded-xl border border-line/60 bg-white ${compact ? "p-4" : "p-6"}`}
        >
          <h2
            id={`design-group-${group.group}`}
            className="text-app-card-title font-bold text-ink-strong"
          >
            {group.label}
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {group.cards.map((card) => (
              <article
                key={card.id}
                aria-label={`${card.numeral} ${card.title}`}
                className="flex flex-col gap-2 rounded-lg bg-surface-04/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-app-body font-bold text-ink-strong">
                    {`${card.numeral} ${card.title}`}
                  </h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-app-badge text-ink-sub">
                    {card.length}
                  </span>
                </div>
                <p className="text-app-label text-ink-sub">{card.role}</p>
                <Bulleted label="반드시 들어갈 것" items={card.must} />
                <Bulleted label="피해야 할 것" items={card.avoid} />
                <p className="text-app-label font-semibold text-ink-strong">
                  {`작성 요령: ${card.tip}`}
                </p>
                {card.id === "III" && (
                  <div className="mt-2 flex flex-col gap-2">
                    <p className="text-app-label font-semibold text-ink-strong">
                      자료 출처표
                    </p>
                    <Table aria-label="자료 출처표">
                      <TableHeader>
                        <TableRow>
                          <TableHead className={TH}>항목</TableHead>
                          <TableHead className={TH}>출처</TableHead>
                          <TableHead className={TH}>기준 시점</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {design.sourceTable.map((row) => (
                          <TableRow key={row.item}>
                            <TableCell className={`${TD} font-semibold`}>
                              {row.item}
                            </TableCell>
                            <TableCell className={TD}>확인 필요</TableCell>
                            <TableCell className={TD}>확인 필요</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-app-caption text-ink-sub">
                      {SOURCE_TABLE_NOTE}
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      <Card
        title="자료 확보 계획"
        note="논문 제목, 저자, 연도, 링크는 만들지 않아요. 검색어, 찾을 기관, 확인할 항목으로 안내해요."
        compact={compact}
      >
        <Table aria-label="자료 확보 계획">
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>검색어</TableHead>
              <TableHead className={TH}>찾을 기관</TableHead>
              <TableHead className={TH}>확인할 항목</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {design.searchPlan.map((row) => (
              <TableRow key={`${row.keyword}-${row.institution}`}>
                <TableCell className={`${TD} font-semibold`}>
                  {row.keyword}
                </TableCell>
                <TableCell className={TD}>{row.institution}</TableCell>
                <TableCell className={TD}>{row.item}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card title="결과별 해석 질문" compact={compact}>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-1">
          <dt className="text-app-label font-semibold text-ink-sub">같을 때</dt>
          <dd className="text-app-label text-ink-strong">{questions.same}</dd>
          <dt className="text-app-label font-semibold text-ink-sub">다를 때</dt>
          <dd className="text-app-label text-ink-strong">
            {questions.different}
          </dd>
          <dt className="text-app-label font-semibold text-ink-sub">
            부족할 때
          </dt>
          <dd className="text-app-label text-ink-strong">
            {questions.insufficient}
          </dd>
        </dl>
      </Card>

      <Card
        title="평가 기준 미리 보기"
        note="평가 단계에서 같은 기준을 써요. 새 요구를 더하지 않아요."
        compact={compact}
      >
        <Table aria-label="평가 기준 미리 보기">
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>평가 항목</TableHead>
              <TableHead className={`${TH} text-right`}>배점</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {design.rubricPreview.map((item) => (
              <TableRow key={item.id}>
                <TableCell className={`${TD} font-semibold`}>
                  {item.label}
                </TableCell>
                <TableCell className={`${TD} text-right`}>
                  {item.maxScore}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-app-caption text-ink-sub">{SCORE_FORMULA}</p>
      </Card>

      <Card title="최소 범위와 선택 심화" compact={compact}>
        <Bulleted label="최소 범위" items={design.scope.minimum} />
        <Bulleted label="선택 심화" items={design.scope.optional} />
      </Card>

      <Card
        title={`작성 체크리스트 (${checklist.length})`}
        note="작성 화면의 설계 이행 점검과 평가의 이행표가 같은 목록이에요."
        compact={compact}
      >
        <ol aria-label="작성 체크리스트" className="flex flex-col gap-2">
          {checklist.map((row) => (
            <li key={row.no} className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-04 text-app-caption font-semibold text-ink-strong">
                {row.no}
              </span>
              <span className="flex flex-col">
                <span className="text-app-label text-ink-strong">
                  {row.text}
                </span>
                <span className="text-app-caption text-ink-sub">
                  {row.meta}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="해서는 안 되는 것" compact={compact}>
        <ul className="flex flex-wrap gap-2">
          {design.forbidden.map((text) => (
            <li
              key={text}
              className="rounded-full bg-amber-50 px-3 py-1 text-app-caption text-ink-strong"
            >
              {text}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
