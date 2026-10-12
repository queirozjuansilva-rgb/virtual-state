/** Traduz códigos de erro do Supabase Auth para mensagens em pt-BR. */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  user_already_exists: "Já existe uma conta com este e-mail. Tente entrar.",
  email_exists: "Já existe uma conta com este e-mail. Tente entrar.",
  weak_password: "Senha fraca. Use uma senha mais longa e menos previsível.",
  over_email_send_rate_limit:
    "Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  signup_disabled: "Novos cadastros estão desativados no momento.",
  otp_expired: "O link expirou. Peça um novo.",
  email_address_invalid: "Este endereço de e-mail não é aceito. Use outro e-mail.",
  // SMTP padrão do Supabase (dev) só envia para membros do time do projeto.
  email_address_not_authorized:
    "Este ambiente ainda não envia e-mails para este endereço. Fale com o administrador.",
}

export const GENERIC_AUTH_ERROR = "Não foi possível concluir. Tente novamente."

export function authErrorMessage(code: string | undefined | null): string {
  return (code && MESSAGES[code]) || GENERIC_AUTH_ERROR
}
