import React, { useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { Card, Icon, Note, SectionLabel, T } from '../components/ui';
import type { IconName } from '../components/ui';
import { PageTitle, Screen, useWide } from '../components/Screen';
import { colors, common, font } from '../theme';

const sources = [
  { label: 'WHO: Leishmaniasis', url: 'https://www.who.int/news-room/questions-and-answers/item/leishmaniasis' },
  { label: 'WHO: Vector control', url: 'https://www.who.int/teams/control-of-neglected-tropical-diseases/leishmaniasis/vector-control' },
  { label: 'WHO EMRO: Community guidance', url: 'https://www.emro.who.int/cpi/publications/cutaneous-leishmaniasis-risk-communication-and-community-engagement-guidance.html' },
  { label: 'CDC: Preventing leishmaniasis', url: 'https://www.cdc.gov/leishmaniasis/prevention/index.html' },
];

type PreventionSection = {
  id: string;
  title: string;
  icon: IconName;
  image?: ImageSourcePropType;
  alt?: string;
  points: string[];
};

const sections: PreventionSection[] = [
  {
    id: 'evening',
    title: 'Before going out in the evening',
    icon: 'sun',
    image: require('../../assets/prevention-clothing.jpg'),
    alt: 'Illustrative photo of long-sleeved clothing outdoors',
    points: [
      'Sand flies often bite after sunset and during the night. Take extra care at these times.',
      'When practical, wear a long-sleeved shirt, long trousers, and socks. Cover ankles and tuck clothing in loosely.',
      'If you have to work outside, use clothing that covers skin while still being comfortable in the heat.',
    ],
  },
  {
    id: 'sleep',
    title: 'At home and while sleeping',
    icon: 'moon',
    image: require('../../assets/prevention-bednet.jpg'),
    alt: 'Illustrative photo of a fine-mesh bed net around a bed',
    points: [
      'Use a fine-mesh bed net and tuck its edges under the mattress or bedding. Check for holes.',
      'Sand flies are smaller than mosquitoes. A net or screen with large holes may not keep them out.',
      'Use a screened room if available. Try to sleep indoors, under a net, and off the ground rather than outside.',
      'If local health staff provide an insecticide-treated net, follow its instructions. Do not treat a net yourself unless its label says how.',
    ],
  },
  {
    id: 'repellent',
    title: 'Using insect repellent safely',
    icon: 'shield',
    image: require('../../assets/prevention-repellent.jpg'),
    alt: 'Illustrative photo of repellent being applied to an arm',
    points: [
      'Choose a locally approved repellent and read the label before use.',
      'Apply only as the label says, to exposed skin or clothing. Do not put it in the eyes, mouth, or on a sore or cut.',
      'For a child, an adult should check the label and apply the product only if it is allowed for that child’s age.',
      'Do not spray insecticide or repellent onto skin, bedding, or clothes unless the product label specifically permits it.',
    ],
  },
  {
    id: 'home',
    title: 'Around the home and neighbourhood',
    icon: 'home',
    points: [
      'Where possible, repair holes in door and window screens and close cracks in sleeping-room walls.',
      'Keep household rubbish covered or remove it regularly. Keep animal sleeping areas clean and separate from people’s sleeping area when practical.',
      'Do not kill animals or use pesticides based on guesswork. Ask the local health or vector-control team what is appropriate in your area.',
    ],
  },
  {
    id: 'sore',
    title: 'If someone has a skin sore',
    icon: 'activity',
    points: [
      'Have a sore that lasts, grows, or does not heal checked by a health worker. Many different problems can look like cutaneous leishmaniasis.',
      'Visit a nearby health facility, such as a Basic Health Unit (BHU), Rural Health Centre (RHC), or hospital. Tell the health worker when it began and where the person has been living or travelling.',
      'A health worker can decide whether tests or referral are needed. This app cannot confirm or rule out the disease.',
    ],
  },
];

function GuideSection({
  item,
  open,
  onPress,
  wide,
}: {
  item: PreventionSection;
  open: boolean;
  onPress: () => void;
  wide: boolean;
}) {
  return (
    <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, minHeight: 68, backgroundColor: pressed ? colors.redLight : colors.white })}
      >
        <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.redLight }}>
          <Icon name={item.icon} size={19} color={colors.red} />
        </View>
        <T style={{ flex: 1, fontFamily: font.semibold, fontSize: 15, lineHeight: 21 }}>{item.title}</T>
        <Icon name={open ? 'minus' : 'plus'} size={19} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={{ padding: 16, paddingTop: 0, gap: 12 }}>
          {item.image && (
            <Image
              source={item.image}
              accessibilityLabel={item.alt}
              resizeMode="cover"
              style={{ width: '100%', height: wide ? 210 : 174, borderRadius: 12, backgroundColor: colors.redLight }}
            />
          )}
          {item.points.map((point, index) => (
            <View key={point} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.redLight, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                <T style={{ color: colors.red, fontSize: 11, fontFamily: font.bold }}>{index + 1}</T>
              </View>
              <T style={{ flex: 1, color: colors.ink, fontSize: 13, lineHeight: 21 }}>{point}</T>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

export function PreventionScreen() {
  const wide = useWide();
  const [open, setOpen] = useState('evening');
  return (
    <Screen narrow>
      <PageTitle title="Prevent sand fly bites" description="Practical steps for people and families in Pakistan." />
      <View style={{ gap: 20 }}>
        <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'stretch' : undefined }}>
            <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="info" size={18} color={colors.red} />
                <T style={{ color: colors.red, fontFamily: font.bold, fontSize: 12 }}>KNOW THE BITE</T>
              </View>
              <T style={{ fontFamily: font.displayBold, fontSize: 20, lineHeight: 27 }}>Sand flies are tiny biting flies</T>
              <T style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>
                An infected sand fly can spread cutaneous leishmaniasis (CL). Sand flies are smaller than mosquitoes, so ordinary screens may not keep all of them out. There is no vaccine or tablet to prevent CL; bite protection matters.
              </T>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: wide ? 16 : 0 }}>
              <Image
                source={require('../../assets/prevention-bednet.jpg')}
                accessibilityLabel="Illustrative photo showing a bed protected by a fine-mesh net"
                resizeMode="cover"
                style={{ width: '100%', height: wide ? 226 : 190, borderRadius: 12 }}
              />
            </View>
          </View>
          <View style={{ flexDirection: wide ? 'row' : 'column', borderTopWidth: 1, borderColor: colors.line }}>
            <View style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Icon name="sun" size={18} color={colors.red} />
              <View style={{ flex: 1, gap: 3 }}><T style={{ fontFamily: font.semibold, fontSize: 13 }}>Evening and night</T><T style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Take extra care after sunset and while sleeping.</T></View>
            </View>
            <View style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: wide ? 1 : 0, borderTopWidth: wide ? 0 : 1, borderColor: colors.line }}>
              <Icon name="map-pin" size={18} color={colors.red} />
              <View style={{ flex: 1, gap: 3 }}><T style={{ fontFamily: font.semibold, fontSize: 13 }}>Local advice</T><T style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Risk and the right control steps vary by district.</T></View>
            </View>
          </View>
        </Card>

        <View style={{ gap: 10 }}>
          <SectionLabel label="Your prevention plan" />
          <T style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
            Open a section for simple steps. Use the steps that are practical and available to you.
          </T>
          <View style={{ gap: 10 }}>
            {sections.map((item) => (
              <GuideSection key={item.id} item={item} open={open === item.id} wide={wide} onPress={() => setOpen(open === item.id ? '' : item.id)} />
            ))}
          </View>
        </View>

        <Note tone="amber" icon="alert-circle" title="Do not confuse sand flies with mosquitoes">
          Removing still water helps prevent mosquitoes. Sand flies grow in different places, so this alone will not prevent CL. Ask your local health worker which steps are right in your area.
        </Note>

        <Card style={{ gap: 8 }}>
          <T style={{ fontFamily: font.semibold, fontSize: 15 }}>Reliable health information</T>
          <T style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>Read more from the World Health Organization and the CDC.</T>
          {sources.map((source) => (
            <Pressable key={source.url} accessibilityRole="link" onPress={() => void Linking.openURL(source.url)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Icon name="external-link" size={15} color={colors.red} />
              <T style={{ color: colors.red, fontSize: 13, fontFamily: font.medium }}>{source.label}</T>
            </Pressable>
          ))}
        </Card>
        <T style={{ fontSize: 11, color: colors.muted }}>Photos are illustrative. Prevention lowers risk but cannot guarantee protection.</T>
      </View>
    </Screen>
  );
}
