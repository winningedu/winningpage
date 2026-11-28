// 읽기가 함께 시작하는지 보는 테스트용 도구. 테스트 파일에서만 import 한다.
// 고른 읽기(from 의 테이블, rpc 의 이름)는 release() 를 부를 때까지 끝나지 않는다. 앞선 읽기가 끝나야 다음 읽기를 시작하는 코드는
// 첫 읽기에서 멈추므로, started 에 몇 개가 올라왔는지로 "같이 시작했는가"를 단언한다.

export interface ReadTarget {
  kind: "from" | "rpc";
  name: string;
  /** 이 대상이 몇 번째로 불렸는지(0부터). 관리자 판정이 먼저 읽는 테이블을 건너뛸 때 쓴다. */
  nth: number;
}

export interface Gate {
  /** 시작한 읽기, 시작한 순서대로 "from:테이블" 또는 "rpc:이름". */
  started: string[];
  release(): void;
  /** 대기 중인 마이크로태스크와 짧은 타이머를 비운다. */
  settle(): Promise<void>;
}

type Thenable = { then: (...args: unknown[]) => unknown };

const isThenable = (value: unknown): value is Thenable =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Thenable).then === "function";

export function gateReads<T extends { from: unknown; rpc: unknown }>(
  admin: T,
  shouldGate: (target: ReadTarget) => boolean,
): { admin: T; gate: Gate } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const started: string[] = [];
  const counts = new Map<string, number>();

  const wrap = <O extends object>(target: O, label: string): O =>
    new Proxy(target, {
      get(object, prop) {
        const value = Reflect.get(object, prop, object);
        if (typeof value !== "function") return value;
        if (prop === "then") {
          return (
            resolve: (v: unknown) => unknown,
            reject: (e: unknown) => unknown,
          ) => {
            started.push(label);
            return opened
              .then(
                () =>
                  new Promise((ok, fail) => {
                    (value as Thenable["then"]).call(object, ok, fail);
                  }),
              )
              .then(resolve, reject);
          };
        }
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(
            object,
            args,
          );
          if (out === object) return wrap(object, label);
          if (out instanceof Promise) {
            started.push(label);
            return opened.then(() => out);
          }
          if (isThenable(out)) return wrap(out as object, label);
          return out;
        };
      },
    });

  const pick = (kind: "from" | "rpc", name: string) => {
    const key = `${kind}:${name}`;
    const nth = counts.get(key) ?? 0;
    counts.set(key, nth + 1);
    return shouldGate({ kind, name, nth }) ? key : null;
  };

  const source = admin as unknown as {
    from: (table: string) => object;
    rpc: (name: string, args: unknown) => unknown;
  };
  const wrapped = {
    ...admin,
    from: (table: string) => {
      const label = pick("from", table);
      const chain = source.from(table);
      return label ? wrap(chain, label) : chain;
    },
    rpc: (name: string, args: unknown) => {
      const label = pick("rpc", name);
      const out = source.rpc(name, args);
      if (!label) return out;
      started.push(label);
      return opened.then(() => out);
    },
  } as T;

  return {
    admin: wrapped,
    gate: {
      started,
      release: open,
      async settle() {
        for (let i = 0; i < 5; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      },
    },
  };
}
