import { z } from "zod/v4";

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const passcodeSchema = z.object({
  passcode: z.string().min(1, "Passcode is required"),
});

export type PasscodeInput = z.infer<typeof passcodeSchema>;
