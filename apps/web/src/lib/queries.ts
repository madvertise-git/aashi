"use client";

import type { Account, Contact, Invite, Me, Member, Page } from "@aashi/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

// Cache keys start with the tenant they belong to, so one customer's data is
// never shown under another's.
export const keys = {
  me: ["me"] as const,
  accounts: (agencyId: string) => ["agency", agencyId, "accounts"] as const,
  members: (agencyId: string) => ["agency", agencyId, "members"] as const,
  invites: (agencyId: string) => ["agency", agencyId, "invites"] as const,
  account: (accountId: string) => ["account", accountId] as const,
  contacts: (accountId: string) => ["account", accountId, "contacts"] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Me>("/v1/me") });

export const useAccounts = (agencyId: string | undefined) =>
  useQuery({
    queryKey: keys.accounts(agencyId ?? ""),
    queryFn: () => api<Account[]>(`/v1/agencies/${agencyId}/accounts`),
    enabled: !!agencyId,
  });

export const useAccount = (accountId: string) =>
  useQuery({ queryKey: keys.account(accountId), queryFn: () => api<Account>(`/v1/accounts/${accountId}`) });

export const useContacts = (accountId: string) =>
  useQuery({
    queryKey: keys.contacts(accountId),
    queryFn: () => api<Page<Contact>>(`/v1/accounts/${accountId}/contacts`),
  });

export const useMembers = (agencyId: string) =>
  useQuery({ queryKey: keys.members(agencyId), queryFn: () => api<Member[]>(`/v1/agencies/${agencyId}/members`) });

/** Open invites. Only admins and owners may see them, so pass `enabled` accordingly. */
export const useInvites = (agencyId: string, enabled: boolean) =>
  useQuery({ queryKey: keys.invites(agencyId), queryFn: () => api<Invite[]>(`/v1/agencies/${agencyId}/invites`), enabled });
