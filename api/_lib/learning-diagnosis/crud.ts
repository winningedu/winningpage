// 학습진단 질문, 답변, 추천 프로그램 라우트가 같이 쓰는 목록, 등록, 수정, 삭제 처리.
// 서비스 롤은 RLS 를 건너뛰므로 옛 RLS(관리자 ALL)가 허용한 동작만 연다. 쓰기가 닿은 행이 없으면 404 다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { z } from "zod";
import { parseInput } from "../coupon/parseInput.js";
import type { HandlerCtx } from "../handler.js";
import { sendError } from "../httpResponse.js";

type Table =
  | "learning_diagnosis_questions"
  | "learning_diagnosis_options"
  | "learning_diagnosis_programs";

function sendLdNotFound(res: VercelResponse, what: string): void {
  sendError(res, "problem", 404, `${what}을 찾을 수 없어요.`, "NOT_FOUND");
}

interface CollectionOptions<S extends z.ZodType> {
  table: Table;
  what: string;
  createSchema: S;
  /** 검증한 본문을 DB 행으로 바꾼다. */
  toRow: (body: z.output<S>) => Record<string, unknown>;
}

/** GET 목록(정렬은 옛 화면과 같다), POST 등록. */
export async function handleCollection<S extends z.ZodType>(
  req: VercelRequest,
  res: VercelResponse,
  ctx: HandlerCtx,
  opts: CollectionOptions<S>,
): Promise<void> {
  if (req.method === "POST") {
    const body = parseInput(res, opts.createSchema, req.body);
    if (!body) return;
    const { data, error } = await ctx.supabaseAdmin
      .from(opts.table)
      .insert(opts.toRow(body))
      .select("*")
      .single();
    if (error) {
      // 상위 질문이 없으면 FK 위반이다.
      if (error.code === "23503") {
        sendLdNotFound(res, opts.what);
        return;
      }
      throw new Error("learning diagnosis insert failed");
    }
    res.status(201).json(data);
    return;
  }
  const { data, error } = await ctx.supabaseAdmin
    .from(opts.table)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error("learning diagnosis read failed");
  res.status(200).json({ items: data ?? [] });
}

interface ItemOptions<S extends z.ZodType> {
  table: Table;
  what: string;
  patchSchema: S;
  toRow: (body: z.output<S>) => Record<string, unknown>;
}

/** PATCH 수정, DELETE 삭제. 닿은 행이 없으면 404 다. */
export async function handleItem<S extends z.ZodType>(
  req: VercelRequest,
  res: VercelResponse,
  ctx: HandlerCtx & { query: { id: string } },
  opts: ItemOptions<S>,
): Promise<void> {
  const { id } = ctx.query;
  if (req.method === "DELETE") {
    const { data, error } = await ctx.supabaseAdmin
      .from(opts.table)
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw new Error("learning diagnosis delete failed");
    if (!data || data.length === 0) {
      sendLdNotFound(res, opts.what);
      return;
    }
    res.status(204).end();
    return;
  }
  const body = parseInput(res, opts.patchSchema, req.body);
  if (!body) return;
  const { data, error } = await ctx.supabaseAdmin
    .from(opts.table)
    .update(opts.toRow(body))
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error("learning diagnosis update failed");
  if (!data) {
    sendLdNotFound(res, opts.what);
    return;
  }
  res.status(200).json(data);
}
