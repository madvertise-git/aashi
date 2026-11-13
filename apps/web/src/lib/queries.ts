"use client";

import { useQuery } from "@tanstack/react-query";
import { client } from "./api";

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

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: async () => (await client.GET("/v1/me")).data! });

export const useAccounts = (agencyId: string | undefined) =>
  useQuery({
    queryKey: keys.accounts(agencyId ?? ""),
    queryFn: async () =>
      (await client.GET("/v1/agencies/{agencyId}/accounts", { params: { path: { agencyId: agencyId! } } })).data!,
    enabled: !!agencyId,
  });

export const useAccount = (accountId: string) =>
  useQuery({
    queryKey: keys.account(accountId),
    queryFn: async () => (await client.GET("/v1/accounts/{accountId}", { params: { path: { accountId } } })).data!,
  });

export const useContacts = (accountId: string) =>
  useQuery({
    queryKey: keys.contacts(accountId),
    queryFn: async () =>
      (await client.GET("/v1/accounts/{accountId}/contacts", { params: { path: { accountId } } })).data!,
  });

export const useMembers = (agencyId: string) =>
  useQuery({
    queryKey: keys.members(agencyId),
    queryFn: async () => (await client.GET("/v1/agencies/{agencyId}/members", { params: { path: { agencyId } } })).data!,
  });

/** Open invites. Only admins and owners may see them, so pass `enabled` accordingly. */
export const useInvites = (agencyId: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.invites(agencyId),
    queryFn: async () => (await client.GET("/v1/agencies/{agencyId}/invites", { params: { path: { agencyId } } })).data!,
    enabled,
  });
