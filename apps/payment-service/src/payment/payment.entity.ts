import { Column, Entity, PrimaryColumn } from 'typeorm';
@Entity({name:'payments'})
export class PaymentEntity{
 @PrimaryColumn({name:'payment_id',type:'uuid'}) paymentId:string;
 @Column({name:'transaction_id',type:'uuid',unique:true}) transactionId:string;
 @Column({type:'numeric',precision:18,scale:2}) amount:string;
 @Column({type:'varchar',length:30}) status:'APPROVED'|'REJECTED';
 @Column({type:'varchar',length:200,nullable:true}) reason:string|null;
 @Column({name:'correlation_id',type:'uuid'}) correlationId:string;
 @Column({name:'created_at',type:'timestamptz'}) createdAt:Date;
}
