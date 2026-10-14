import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './domain/types';
export const useNav = () => useNavigation<NativeStackNavigationProp<RootStackParamList>>();
