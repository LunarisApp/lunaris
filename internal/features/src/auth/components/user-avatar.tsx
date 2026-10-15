"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  type AvatarSize,
} from "@lunarisapp/ui/components/avatar";
import { getInitials } from "@repo/utils";
import type { ComponentProps, Ref } from "react";
import { useAvatarUrl } from "../hooks/use-avatar-url";
import { useGravatarUrl } from "../use-gravatar-url";

const GRAVATAR_SIZE: Record<AvatarSize, number | undefined> = {
  sm: 48,
  default: undefined,
  lg: 80,
  xl: 128,
};

interface UserAvatarProps extends Omit<ComponentProps<typeof Avatar>, "ref"> {
  ref?: Ref<HTMLSpanElement>;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function UserAvatar({ user, size, ...avatarProps }: UserAvatarProps) {
  const gravatarSize = GRAVATAR_SIZE[size ?? "default"];
  const avatarUrl = useAvatarUrl(user?.image ? user.id : undefined);
  const src = avatarUrl ?? useGravatarUrl(user?.email, gravatarSize);
  return (
    <Avatar size={size} {...avatarProps}>
      <AvatarImage alt={user?.name ?? ""} src={src ?? undefined} />
      <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
    </Avatar>
  );
}
