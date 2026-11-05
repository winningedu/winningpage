// 이름 앞에 첫 글자 원을 붙인다. 이름은 서버가 준 그대로(가린 이름 포함) 쓴다.

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function NameCell({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback className="bg-surface-avatar text-app-caption font-medium text-ink">
          {name.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <span className="text-app-body font-medium">{name}</span>
    </span>
  );
}
