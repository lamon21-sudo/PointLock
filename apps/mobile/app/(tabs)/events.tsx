import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/services/api';
import { SportsEvent, formatOdds, formatSpread } from '@pick-rivals/shared-types';
import { useState } from 'react';

type SportFilter = 'ALL' | 'NFL' | 'NBA';

function EventCard({ event }: { event: SportsEvent }) {
  const odds = event.oddsData;
  const gameDate = new Date(event.scheduledAt);
  const formattedDate = gameDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = gameDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View className="bg-surface rounded-2xl p-4 mb-3">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center">
          <View className="bg-primary/20 px-2 py-1 rounded mr-2">
            <Text className="text-primary text-xs font-semibold">{event.sport}</Text>
          </View>
          <Text className="text-gray-400 text-xs">
            {formattedDate} • {formattedTime}
          </Text>
        </View>
      </View>

      {/* Teams */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-1">
          <Text className="text-white font-bold text-base">{event.awayTeamAbbr || event.awayTeamName}</Text>
          <Text className="text-gray-400 text-xs">Away</Text>
        </View>
        <Text className="text-gray-500 font-bold mx-4">@</Text>
        <View className="flex-1 items-end">
          <Text className="text-white font-bold text-base">{event.homeTeamAbbr || event.homeTeamName}</Text>
          <Text className="text-gray-400 text-xs">Home</Text>
        </View>
      </View>

      {/* Odds Grid */}
      <View className="border-t border-background pt-3">
        {/* Spread */}
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-400 text-xs w-16">Spread</Text>
          <Pressable className="flex-1 bg-background rounded py-2 mx-1 active:bg-surface-elevated">
            <Text className="text-white text-center text-sm font-medium">
              {formatSpread(odds.spread.away.line)} ({formatOdds(odds.spread.away.odds)})
            </Text>
          </Pressable>
          <Pressable className="flex-1 bg-background rounded py-2 mx-1 active:bg-surface-elevated">
            <Text className="text-white text-center text-sm font-medium">
              {formatSpread(odds.spread.home.line)} ({formatOdds(odds.spread.home.odds)})
            </Text>
          </Pressable>
        </View>

        {/* Moneyline */}
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-400 text-xs w-16">Money</Text>
          <Pressable className="flex-1 bg-background rounded py-2 mx-1 active:bg-surface-elevated">
            <Text className="text-white text-center text-sm font-medium">
              {formatOdds(odds.moneyline.away)}
            </Text>
          </Pressable>
          <Pressable className="flex-1 bg-background rounded py-2 mx-1 active:bg-surface-elevated">
            <Text className="text-white text-center text-sm font-medium">
              {formatOdds(odds.moneyline.home)}
            </Text>
          </Pressable>
        </View>

        {/* Total */}
        <View className="flex-row justify-between">
          <Text className="text-gray-400 text-xs w-16">Total</Text>
          <Pressable className="flex-1 bg-background rounded py-2 mx-1 active:bg-surface-elevated">
            <Text className="text-white text-center text-sm font-medium">
              O {odds.total.line} ({formatOdds(odds.total.over)})
            </Text>
          </Pressable>
          <Pressable className="flex-1 bg-background rounded py-2 mx-1 active:bg-surface-elevated">
            <Text className="text-white text-center text-sm font-medium">
              U {odds.total.line} ({formatOdds(odds.total.under)})
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function EventsScreen() {
  const [filter, setFilter] = useState<SportFilter>('ALL');

  const { data, isLoading, error } = useQuery({
    queryKey: ['events', filter],
    queryFn: async () => {
      const params = filter !== 'ALL' ? `?sport=${filter}` : '';
      const response = await api.get(`/events${params}`);
      return response.data;
    },
  });

  const events: SportsEvent[] = data?.data || [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      {/* Sport Filter */}
      <View className="flex-row px-4 py-3 gap-2">
        {(['ALL', 'NFL', 'NBA'] as SportFilter[]).map((sport) => (
          <Pressable
            key={sport}
            onPress={() => setFilter(sport)}
            className={`px-4 py-2 rounded-full ${
              filter === sport ? 'bg-primary' : 'bg-surface'
            }`}
          >
            <Text
              className={`font-semibold ${
                filter === sport ? 'text-white' : 'text-gray-400'
              }`}
            >
              {sport}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView className="flex-1 px-4">
        {isLoading && (
          <View className="py-12 items-center">
            <ActivityIndicator color="#6366f1" size="large" />
            <Text className="text-gray-400 mt-4">Loading events...</Text>
          </View>
        )}

        {error && (
          <View className="bg-error/20 rounded-xl p-4 my-4">
            <Text className="text-error font-semibold">Error loading events</Text>
            <Text className="text-gray-400 text-sm mt-1">
              Make sure the API server is running on port 3000
            </Text>
          </View>
        )}

        {!isLoading && !error && events.length === 0 && (
          <View className="py-12 items-center">
            <Text className="text-4xl mb-4">📅</Text>
            <Text className="text-white font-semibold">No events found</Text>
            <Text className="text-gray-400 text-sm">Check back later</Text>
          </View>
        )}

        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}

        {/* Bottom padding */}
        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}
