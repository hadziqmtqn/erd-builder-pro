import { supabase } from '@/lib/supabase';

export interface AiConfig {
  baseUrl: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
}

export async function resolveAiConfig(userId: string | null): Promise<AiConfig> {
  let configQuery = supabase
    .from('user_ai_configs')
    .select('*, ai_providers(*)')
    .eq('is_enabled', true)
    .not('selected_model_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (userId) {
    configQuery = configQuery.eq('user_id', userId);
  }

  const { data: configData, error: configError } = await configQuery;

  if (configError) throw configError;
  if (!configData || configData.length === 0) {
    throw new Error('No AI provider configured. Go to Settings > AI to configure.');
  }

  const config = configData[0];
  const provider = config.ai_providers;
  const resolvedBaseUrl = provider?.base_url || 'https://api.openai.com/v1';
  const resolvedApiKey = config.api_key;

  const { data: modelData } = await supabase
    .from('ai_models')
    .select('model_identifier')
    .eq('id', config.selected_model_id)
    .single();

  return {
    baseUrl: resolvedBaseUrl,
    apiKey: resolvedApiKey,
    model: modelData?.model_identifier || 'gpt-4o-mini',
  };
}
