import { z } from 'zod';

export const checkoutSchema = z.object({
  planTier: z.enum(['STARTER', 'PROFISSIONAL']),
  voiceAddonEnabled: z.boolean().default(false),
  seatCount: z.number().int().min(1).max(200),
  cpfCnpj: z.string().min(11, 'CPF/CNPJ inválido.'),
  postalCode: z.string().min(8, 'CEP inválido.'),
  addressNumber: z.string().min(1, 'Informe o número do endereço.'),
  phone: z.string().min(10, 'Telefone inválido.'),
  creditCard: z.object({
    holderName: z.string().min(1),
    number: z.string().min(13).max(19),
    expiryMonth: z.string().length(2),
    expiryYear: z.string().length(4),
    ccv: z.string().min(3).max(4),
  }),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
