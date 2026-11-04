import Dashboard from '../../dashboard';
import LoginScreen from '../../login-screen';
import {principal,accountState} from '../../../lib/accounts';
export const dynamic='force-dynamic';
export default async function CustomMaterialPage({params}:{params:Promise<{materialId:string}>}){
 const {materialId}=await params,user=await principal();if(!user)return <LoginScreen {...await accountState()}/>;
 return <Dashboard user={user} initialView="self-materials" initialSelfMaterial={materialId}/>;
}
