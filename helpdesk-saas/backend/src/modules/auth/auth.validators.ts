import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido.'),
  password: z.string().min(1, 'Senha é obrigatória.'),
});

export const registerCompanySchema = z.object({
  companyName: z.string().min(1, 'Informe o nome da empresa.'),
  name: z.string().min(1, 'Informe seu nome.'),
  email: z.string().email('E-mail inválido.'),
  password: z.string().min(10, 'A senha precisa ter no mínimo 10 caracteres.'),
});

export const completeOAuthSignupSchema = z.object({
  pendingToken: z.string().min(1),
  companyName: z.string().min(1, 'Informe o nome da empresa.'),
  // Login continua sendo só e-mail/senha (nunca "entrar com Google") — por
  // isso pedimos uma senha aqui também, senão a conta ficaria sem jeito
  // nenhum de acessar depois desse primeiro cadastro.
  password: z.string().min(10, 'A senha precisa ter no mínimo 10 caracteres.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('E-mail inválido.'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10, 'A senha precisa ter no mínimo 10 caracteres.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;
export type CompleteOAuthSignupInput = z.infer<typeof completeOAuthSignupSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
