import { z } from "zod";

export const teamMemberSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  team: z.string().trim().max(80).optional().or(z.literal("")),
});

export const laptopSchema = z.object({
  asset_tag: z.string().trim().min(1, "Asset tag required").max(60),
  model: z.string().trim().max(120).optional().or(z.literal("")),
  team: z.string().trim().max(80).optional().or(z.literal("")),
  assigned_member_id: z.string().uuid().optional().nullable(),
});

export type TeamMemberInput = z.infer<typeof teamMemberSchema>;
export type LaptopInput = z.infer<typeof laptopSchema>;
