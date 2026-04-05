import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { KhatmStackParamList } from '../navigation';
import { KHATM_COLORS } from '../constants';
import { useKhatmScreen } from '../hooks/useKhatmQueries';
import { useStartNewCycle } from '../hooks/useKhatmMutations';
import { supabase } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const duaContent = require('../assets/dua-khatm.json') as {
  dua: Record<
    string,
    { content_ready: boolean; arabic: string; transliteration: string; translation: string }
  >;
  completion_message: { primary: string; secondary: string };
  memorial_suffix: string;
};

type Props = NativeStackScreenProps<KhatmStackParamList, 'Completion'>;

export function CompletionScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const { data: screenData } = useKhatmScreen(groupId);
  const group = screenData?.group;
  const participants = screenData?.participants ?? [];
  const startNewCycle = useStartNewCycle();

  const [newCycleError, setNewCycleError] = useState<string | null>(null);

  const langCode = group?.language ?? 'EN';
  const duaEntry =
    duaContent.dua[langCode]?.content_ready
      ? duaContent.dua[langCode]
      : duaContent.dua['EN'];

  const joinedCount = participants.filter((p) => p.status === 'JOINED').length;

  // Dedication line
  let dedicationText: string | null = null;
  if (group?.dedicated_to_name) {
    if (group.dedicated_to_relationship) {
      dedicationText = `In memory of ${group.dedicated_to_name}, ${group.dedicated_to_relationship}`;
    } else {
      dedicationText = `In memory of ${group.dedicated_to_name}`;
    }
  }

  // Memorial suffix
  let memorialSuffixText: string | null = null;
  if (group?.occasion_type === 'MEMORIAL') {
    memorialSuffixText = duaContent.memorial_suffix.replace(
      '{dedicated_to_name}',
      group.dedicated_to_name ?? ''
    );
  }

  const handleShare = () => {
    const text = `Alhamdulillah! We completed a Khatm of the Quran.\n${group?.title ?? ''}\n${
      group?.dedicated_to_name ? 'In memory of ' + group.dedicated_to_name + '\n' : ''
    }Taqabbal Allahu minna wa minkum.`;
    Share.share({ message: text });
  };

  const handleStartNewCycle = () => {
    setNewCycleError(null);
    startNewCycle.mutate(
      { source_group_id: groupId },
      {
        onSuccess: (newGroup) => {
          navigation.replace('GroupKhatm', { groupId: newGroup.id });
        },
        onError: () => {
          setNewCycleError('Failed to start new cycle. Please try again.');
        },
      }
    );
  };

  const handleArchive = () => {
    Alert.alert(
      'Archive Khatm?',
      'This Khatm will be archived. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('khatm_groups')
              .update({ status: 'ARCHIVED' })
              .eq('id', groupId);
            navigation.popToTop();
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Al-Fatiha opening — Arabic RTL */}
      <Text style={styles.fatiha}>
        {
          'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ'
        }
      </Text>

      {/* Group title */}
      <Text style={styles.groupTitle}>{group?.title ?? ''}</Text>

      {/* Dedication */}
      {dedicationText ? (
        <Text style={styles.dedication}>{dedicationText}</Text>
      ) : null}

      {/* Memorial suffix */}
      {memorialSuffixText ? (
        <Text style={styles.memorialSuffix}>{memorialSuffixText}</Text>
      ) : null}

      {/* Du'a section */}
      <View style={styles.duaSection}>
        <Text style={styles.duaArabic}>{duaEntry.arabic}</Text>
        <Text style={styles.duaTransliteration}>{duaEntry.transliteration}</Text>
        <Text style={styles.duaTranslation}>{duaEntry.translation}</Text>
      </View>

      {/* Completion messages */}
      <Text style={styles.completionPrimary}>{duaContent.completion_message.primary}</Text>
      <Text style={styles.completionSecondary}>{duaContent.completion_message.secondary}</Text>

      {/* Participant count */}
      <Text style={styles.participantCount}>
        {`Completed by ${joinedCount} participants`}
      </Text>

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <Pressable style={styles.button} onPress={handleShare}>
          <Text style={styles.buttonText}>Share</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={handleStartNewCycle}
          disabled={startNewCycle.isPending}
        >
          <Text style={styles.buttonText}>Start Another Cycle</Text>
        </Pressable>

        <Pressable style={styles.button} onPress={handleArchive}>
          <Text style={styles.buttonText}>Archive This Khatm</Text>
        </Pressable>
      </View>

      {/* New cycle error */}
      {newCycleError ? (
        <Text style={styles.errorText}>{newCycleError}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: KHATM_COLORS.primary,
  },
  contentContainer: {
    alignItems: 'center',
    padding: 24,
  },
  fatiha: {
    fontFamily: 'Amiri-Regular',
    fontSize: 28,
    color: 'white',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 16,
    width: '100%',
  },
  groupTitle: {
    fontFamily: 'DMSans-Bold',
    fontSize: 20,
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  dedication: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: 'white',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
  },
  memorialSuffix: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: 'white',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 12,
  },
  duaSection: {
    width: '100%',
    marginBottom: 16,
  },
  duaArabic: {
    fontFamily: 'Amiri-Regular',
    fontSize: 24,
    color: 'white',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 8,
    width: '100%',
  },
  duaTransliteration: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: 'white',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 6,
  },
  duaTranslation: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: 16,
  },
  completionPrimary: {
    fontFamily: 'DMSans-Bold',
    fontSize: 22,
    color: KHATM_COLORS.gold,
    textAlign: 'center',
    marginBottom: 4,
  },
  completionSecondary: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: KHATM_COLORS.gold,
    textAlign: 'center',
    marginBottom: 12,
  },
  participantCount: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: 'white',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 12,
  },
  button: {
    borderWidth: 1.5,
    borderColor: 'white',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginHorizontal: 6,
    marginVertical: 4,
  },
  buttonText: {
    color: 'white',
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
  },
  errorText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#FF6B6B',
    textAlign: 'center',
    marginTop: 8,
  },
});
